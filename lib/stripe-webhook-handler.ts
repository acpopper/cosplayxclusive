import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { getStripe, creatorNetMultiplier } from '@/lib/stripe'
import { maybeSendAutoMessage, isReturningSubscriber } from '@/lib/auto-message'
import { upsertGroupedNotification, maybeSendMilestone } from '@/lib/notifications'
import {
  sendNewPaidSubscriber,
  sendNewTip,
  sendNewPpvUnlock,
  sendFirstSubscriberMilestone,
  sendSubscriptionReceipt,
  sendSubscriptionCanceled,
  sendPaymentFailed,
  sendPpvUnlockReceipt,
  sendTipReceipt,
  sendRefundIssued,
  sendStripeOnboarded,
  sendStripeNeedsAttention,
  sendPayoutSent,
  sendPayoutFailed,
} from '@/lib/email'
import { getPostHogClient } from '@/lib/posthog-server'

export function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ─── helpers ────────────────────────────────────────────────────────────────

// Look up the creator's per-creator platform_fee_percent override.
// Returns null if no override is set (caller falls back to default).
async function getCreatorFeeOverride(
  supabase: SupabaseClient,
  creatorId: string,
): Promise<number | null> {
  const { data } = await supabase
    .from('profiles')
    .select('platform_fee_percent')
    .eq('id', creatorId)
    .maybeSingle()
  return data?.platform_fee_percent ?? null
}

interface CardInfo { brand: string; last4: string }

/** Fetch the latest charge for a PaymentIntent and return card brand/last4. */
async function getCardFromPI(
  paymentIntent: Stripe.PaymentIntent,
  stripeAccount?: string,
): Promise<CardInfo | null> {
  const latestChargeId = typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id
  if (!latestChargeId) return null
  try {
    const charge = await getStripe().charges.retrieve(
      latestChargeId,
      undefined,
      stripeAccount ? { stripeAccount } : undefined,
    )
    const card = charge.payment_method_details?.card
    if (!card) return null
    return { brand: card.brand ?? 'Card', last4: card.last4 ?? '••••' }
  } catch (err) {
    console.error('[webhook] getCardFromPI failed:', err)
    return null
  }
}

async function getCardFromCharge(
  charge: Stripe.Charge,
): Promise<CardInfo | null> {
  const card = charge.payment_method_details?.card
  if (!card) return null
  return { brand: card.brand ?? 'Card', last4: card.last4 ?? '••••' }
}

// Single entry point for both the platform endpoint and the Connect endpoint.
// Each Stripe event carries everything we need to reconcile the platform DB.
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const supabase = getServiceClient()

  // Idempotency: claim event.id before doing any side effects. Stripe can
  // deliver the same event more than once (retries, multiple Dashboard
  // endpoints, overlapping `stripe listen` sessions). The unique PK on
  // processed_stripe_events.event_id means a second delivery returns no rows
  // and we bail out before re-sending emails / re-inserting transactions.
  const { data: claimed, error: claimError } = await supabase
    .from('processed_stripe_events')
    .insert({ event_id: event.id })
    .select('event_id')
    .maybeSingle()

  if (claimError) {
    // Postgres unique_violation = 23505. Treat as "already processed".
    if (claimError.code === '23505') {
      console.log(`[webhook] event ${event.id} already processed, skipping`)
      return
    }
    // Any other DB error (RLS, connectivity) — log and bail rather than
    // double-processing.
    console.error('[webhook] could not claim event for idempotency:', claimError)
    throw claimError
  }
  if (!claimed) {
    console.log(`[webhook] event ${event.id} already processed, skipping`)
    return
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      await handlePaymentIntentSucceeded(supabase, event)
      break
    }

    case 'checkout.session.completed': {
      // Subscription Checkout completion is handled via customer.subscription.created.
      // We only log here for visibility.
      const session = event.data.object as Stripe.Checkout.Session
      const meta = session.metadata || {}
      if (meta.type === 'subscription' && meta.fan_id && meta.creator_id) {
        console.log('[webhook] subscription checkout completed for', meta.fan_id)
      }
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      await handleSubscriptionChange(supabase, event)
      break
    }

    case 'customer.subscription.deleted': {
      await handleSubscriptionDeleted(supabase, event)
      break
    }

    case 'invoice.payment_succeeded': {
      await handleInvoicePaymentSucceeded(supabase, event)
      break
    }

    case 'invoice.payment_failed': {
      await handleInvoicePaymentFailed(supabase, event)
      break
    }

    case 'charge.refunded': {
      await handleChargeRefunded(supabase, event)
      break
    }

    case 'payout.paid': {
      await handlePayoutPaid(supabase, event)
      break
    }

    case 'payout.failed': {
      await handlePayoutFailed(supabase, event)
      break
    }

    case 'account.updated': {
      await handleAccountUpdated(supabase, event)
      break
    }

    default:
      console.log(`[webhook] unhandled event type: ${event.type}`)
  }
}

// ─── handlers ───────────────────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(supabase: SupabaseClient, event: Stripe.Event) {
  const pi   = event.data.object as Stripe.PaymentIntent
  const meta = pi.metadata || {}
  const amountUsd = pi.amount / 100
  const stripeAccount = (event.account as string | undefined) ?? undefined

  if (meta.type === 'tip' && meta.fan_id && meta.post_id) {
    await supabase.from('post_tips').insert({
      post_id:    meta.post_id,
      fan_id:     meta.fan_id,
      amount_usd: amountUsd,
    })

    const [{ data: post }, { data: fan }] = await Promise.all([
      supabase.from('posts').select('creator_id, caption').eq('id', meta.post_id).single(),
      supabase.from('profiles').select('username, display_name, avatar_url').eq('id', meta.fan_id).single(),
    ])

    const tipFeeOverride = post ? await getCreatorFeeOverride(supabase, post.creator_id) : null
    const creatorCut = Number((amountUsd * creatorNetMultiplier(tipFeeOverride)).toFixed(2))

    if (post) {
      await supabase.from('transactions').insert({
        creator_id:      post.creator_id,
        fan_id:          meta.fan_id,
        type:            'tip',
        amount_usd:      creatorCut,
        stripe_event_id: event.id,
      })
    }

    if (post && fan && post.creator_id !== meta.fan_id) {
      const actor = {
        user_id:      meta.fan_id,
        username:     fan.username,
        display_name: fan.display_name,
        avatar_url:   fan.avatar_url,
      }

      const { data: tipsData } = await supabase
        .from('post_tips').select('amount_usd').eq('post_id', meta.post_id)
      const totalTipAmount = (tipsData ?? []).reduce((s, t) => s + Number(t.amount_usd), 0)
      const tipCount       = tipsData?.length ?? 1

      const newCount = await upsertGroupedNotification(supabase, {
        creatorId:   post.creator_id,
        groupKey:    `post_tipped:${meta.post_id}`,
        type:        'post_tipped',
        actor,
        postId:      meta.post_id,
        postCaption: post.caption,
        extra:       { total_tip_amount: totalTipAmount },
      })

      await maybeSendMilestone(supabase, {
        creatorId:   post.creator_id,
        type:        'post_tip_milestone',
        postId:      meta.post_id,
        postCaption: post.caption,
        count:       tipCount,
        extra:       { total_tip_amount: totalTipAmount },
      })

      if (newCount === 1) {
        const [{ data: { user: creatorUser } }, { data: creatorProfile }] = await Promise.all([
          supabase.auth.admin.getUserById(post.creator_id),
          supabase.from('profiles').select('username, display_name').eq('id', post.creator_id).single(),
        ])
        if (creatorUser?.email) {
          await sendNewTip({
            creatorUserId:      post.creator_id,
            creatorEmail:       creatorUser.email,
            creatorDisplayName: creatorProfile?.display_name ?? null,
            creatorUsername:    creatorProfile?.username ?? '',
            fanUsername:        fan.username,
            amountUsd:          creatorCut,
            creatorCutUsd:      creatorCut,
            message:            null,
          })
        }
      }

      // Tip receipt to fan (best effort)
      const { data: { user: fanUser } } = await supabase.auth.admin.getUserById(meta.fan_id)
      if (fanUser?.email) {
        const { data: creatorProfile } = await supabase
          .from('profiles').select('username, display_name').eq('id', post.creator_id).single()
        const card = await getCardFromPI(pi, stripeAccount)
        await sendTipReceipt({
          fanUserId:       meta.fan_id,
          fanEmail:        fanUser.email,
          fanDisplayName:  fan.display_name ?? null,
          fanUsername:     fan.username,
          creatorName:     creatorProfile?.display_name || creatorProfile?.username || 'creator',
          creatorUsername: creatorProfile?.username ?? '',
          amountUsd,
          orderId:         pi.id,
          card,
          paidAt:          new Date(pi.created * 1000),
          postCaption:     post.caption,
          postId:          meta.post_id,
        })
      }
    }
  }

  if (meta.type === 'ppv' && meta.fan_id && meta.post_id) {
    const { data: post } = await supabase
      .from('posts').select('price_usd, creator_id, caption').eq('id', meta.post_id).single()

    await supabase.from('post_purchases').upsert({
      fan_id:                   meta.fan_id,
      post_id:                  meta.post_id,
      stripe_payment_intent_id: pi.id,
      amount_usd:               post?.price_usd || amountUsd,
    }, { onConflict: 'fan_id,post_id', ignoreDuplicates: true })

    const ppvFeeOverride = post ? await getCreatorFeeOverride(supabase, post.creator_id) : null
    const creatorCut = Number((amountUsd * creatorNetMultiplier(ppvFeeOverride)).toFixed(2))

    if (post) {
      await supabase.from('transactions').insert({
        creator_id:      post.creator_id,
        fan_id:          meta.fan_id,
        type:            'ppv',
        amount_usd:      creatorCut,
        stripe_event_id: event.id,
      })

      // Creator + fan emails for the PPV unlock
      const [{ data: { user: fanUser } }, { data: { user: creatorUser } }, { data: fanProfile }, { data: creatorProfile }] = await Promise.all([
        supabase.auth.admin.getUserById(meta.fan_id),
        supabase.auth.admin.getUserById(post.creator_id),
        supabase.from('profiles').select('username, display_name').eq('id', meta.fan_id).single(),
        supabase.from('profiles').select('username, display_name').eq('id', post.creator_id).single(),
      ])

      const card = await getCardFromPI(pi, stripeAccount)
      const contentTitle = post.caption?.trim()
        ? (post.caption.length > 60 ? post.caption.slice(0, 60) + '…' : post.caption)
        : 'Premium post'

      if (fanUser?.email && fanProfile) {
        await sendPpvUnlockReceipt({
          fanUserId:          meta.fan_id,
          fanEmail:           fanUser.email,
          fanDisplayName:     fanProfile.display_name ?? null,
          fanUsername:        fanProfile.username,
          creatorUsername:    creatorProfile?.username ?? '',
          contentTitle,
          contentType:        'Post',
          contentDescription: 'Premium post unlocked',
          amountUsd:          post.price_usd ?? amountUsd,
          orderId:            pi.id,
          card,
          paidAt:             new Date(pi.created * 1000),
          viewUrl:            `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://cosplayxclusive.com'}/posts/${meta.post_id}`,
        })
      }

      if (creatorUser?.email && fanProfile && post.creator_id !== meta.fan_id) {
        const { count: totalUnlocks } = await supabase
          .from('post_purchases')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', meta.post_id)
        await sendNewPpvUnlock({
          creatorUserId:      post.creator_id,
          creatorEmail:       creatorUser.email,
          creatorDisplayName: creatorProfile?.display_name ?? null,
          creatorUsername:    creatorProfile?.username ?? '',
          fanUsername:        fanProfile.username,
          source:             'post',
          contentTitle,
          amountUsd:          post.price_usd ?? amountUsd,
          creatorCutUsd:      creatorCut,
          totalUnlocks:       totalUnlocks ?? 1,
        })
      }
    }

    const phPpv = getPostHogClient()
    phPpv.capture({
      distinctId: meta.fan_id,
      event:      'ppv_purchased',
      properties: { post_id: meta.post_id, amount_usd: post?.price_usd ?? amountUsd, creator_id: post?.creator_id },
    })
    await phPpv.shutdown()
  }

  if (meta.type === 'message_ppv' && meta.fan_id && meta.message_id && meta.creator_id) {
    const { data: message } = await supabase
      .from('messages').select('price_usd, body').eq('id', meta.message_id).single()

    await supabase.from('message_purchases').upsert({
      fan_id:                   meta.fan_id,
      message_id:               meta.message_id,
      stripe_payment_intent_id: pi.id,
      amount_usd:               message?.price_usd ?? amountUsd,
    }, { onConflict: 'fan_id,message_id', ignoreDuplicates: true })

    const msgFeeOverride = await getCreatorFeeOverride(supabase, meta.creator_id)
    const creatorCut = Number((amountUsd * creatorNetMultiplier(msgFeeOverride)).toFixed(2))

    await supabase.from('transactions').insert({
      creator_id:      meta.creator_id,
      fan_id:          meta.fan_id,
      type:            'ppv',
      amount_usd:      creatorCut,
      stripe_event_id: event.id,
    })

    const [{ data: { user: fanUser } }, { data: { user: creatorUser } }, { data: fanProfile }, { data: creatorProfile }] = await Promise.all([
      supabase.auth.admin.getUserById(meta.fan_id),
      supabase.auth.admin.getUserById(meta.creator_id),
      supabase.from('profiles').select('username, display_name').eq('id', meta.fan_id).single(),
      supabase.from('profiles').select('username, display_name').eq('id', meta.creator_id).single(),
    ])

    const card = await getCardFromPI(pi, stripeAccount)
    const preview = message?.body?.trim()
      ? (message.body.length > 60 ? message.body.slice(0, 60) + '…' : message.body)
      : 'PPV message'

    if (fanUser?.email && fanProfile) {
      await sendPpvUnlockReceipt({
        fanUserId:          meta.fan_id,
        fanEmail:           fanUser.email,
        fanDisplayName:     fanProfile.display_name ?? null,
        fanUsername:        fanProfile.username,
        creatorUsername:    creatorProfile?.username ?? '',
        contentTitle:       preview,
        contentType:        'Message',
        contentDescription: 'PPV message unlocked',
        amountUsd:          message?.price_usd ?? amountUsd,
        orderId:            pi.id,
        card,
        paidAt:             new Date(pi.created * 1000),
        viewUrl:            `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://cosplayxclusive.com'}/messages`,
      })
    }

    if (creatorUser?.email && fanProfile) {
      const { count: totalUnlocks } = await supabase
        .from('message_purchases')
        .select('*', { count: 'exact', head: true })
        .eq('message_id', meta.message_id)
      await sendNewPpvUnlock({
        creatorUserId:      meta.creator_id,
        creatorEmail:       creatorUser.email,
        creatorDisplayName: creatorProfile?.display_name ?? null,
        creatorUsername:    creatorProfile?.username ?? '',
        fanUsername:        fanProfile.username,
        source:             'message',
        contentTitle:       preview,
        amountUsd:          message?.price_usd ?? amountUsd,
        creatorCutUsd:      creatorCut,
        totalUnlocks:       totalUnlocks ?? 1,
      })
    }

    const phMsg = getPostHogClient()
    phMsg.capture({
      distinctId: meta.fan_id,
      event:      'message_ppv_purchased',
      properties: { message_id: meta.message_id, amount_usd: message?.price_usd ?? amountUsd, creator_id: meta.creator_id },
    })
    await phMsg.shutdown()
  }
}

async function handleSubscriptionChange(supabase: SupabaseClient, event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription
  const meta = subscription.metadata || {}

  if (!meta.fan_id || !meta.creator_id) {
    console.log('[webhook] subscription event missing metadata, skipping')
    return
  }

  // Stripe v22: current_period_end moved from Subscription to SubscriptionItem
  const firstItem = subscription.items?.data?.[0]
  const currentPeriodEnd = firstItem?.current_period_end
    ? new Date(firstItem.current_period_end * 1000).toISOString()
    : null

  // Embedded direct-charge subs are created with `payment_behavior:
  // default_incomplete`, so the first event we see is `customer.subscription.
  // created` with status='incomplete'. Side-effects (welcome emails, transaction
  // row, notifications) must wait until the sub flips to `active` — which
  // arrives as `customer.subscription.updated`.
  const { data: priorRow } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('fan_id', meta.fan_id)
    .eq('creator_id', meta.creator_id)
    .maybeSingle()

  await supabase.from('subscriptions').upsert(
    {
      fan_id: meta.fan_id,
      creator_id: meta.creator_id,
      stripe_subscription_id: subscription.id,
      stripe_customer_id:
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
      status: subscription.status,
      current_period_end: currentPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fan_id,creator_id' },
  )

  const becameActive =
    (subscription.status === 'active' || subscription.status === 'trialing')
    && priorRow?.status !== 'active' && priorRow?.status !== 'trialing'

  if (!becameActive) return

  const isReturn = await isReturningSubscriber(supabase, meta.fan_id, meta.creator_id)

  const { data: creator } = await supabase
    .from('profiles')
    .select('subscription_price_usd, username, display_name, platform_fee_percent')
    .eq('id', meta.creator_id)
    .single()

  if (creator?.subscription_price_usd) {
    await supabase.from('transactions').insert({
      creator_id:      meta.creator_id,
      fan_id:          meta.fan_id,
      type:            'subscription',
      amount_usd:      Number((creator.subscription_price_usd * creatorNetMultiplier(creator.platform_fee_percent)).toFixed(2)),
      stripe_event_id: event.id,
    })
  }

  const { data: fan } = await supabase
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', meta.fan_id)
    .single()

  if (fan) {
    await supabase.from('notifications').insert({
      user_id: meta.creator_id,
      type:    'new_subscriber',
      payload: {
        fan_id:           meta.fan_id,
        fan_username:     fan.username,
        fan_display_name: fan.display_name,
        fan_avatar_url:   fan.avatar_url,
        sub_type:         'paid',
      },
    })
  }

  const phSub = getPostHogClient()
  phSub.capture({
    distinctId: meta.fan_id,
    event:      'subscription_completed',
    properties: {
      creator_id:             meta.creator_id,
      subscription_price_usd: creator?.subscription_price_usd,
      is_returning:           isReturn,
      stripe_subscription_id: subscription.id,
    },
  })
  await phSub.shutdown()

  await maybeSendAutoMessage(supabase, meta.fan_id, meta.creator_id, isReturn)

  if (fan && creator) {
    const subPrice = Number(creator.subscription_price_usd ?? 0)
    const creatorCut = Number((subPrice * creatorNetMultiplier(creator.platform_fee_percent)).toFixed(2))

    const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(meta.creator_id)
    const { count: paidSubCount } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', meta.creator_id)
      .eq('status', 'active')
    const totalSubs = paidSubCount ?? 1

    if (creatorUser?.email) {
      await sendNewPaidSubscriber({
        creatorUserId:      meta.creator_id,
        creatorEmail:       creatorUser.email,
        creatorDisplayName: creator.display_name ?? null,
        creatorUsername:    creator.username,
        fanUsername:        fan.username,
        fanDisplayName:     fan.display_name ?? null,
        amountUsd:          subPrice,
        creatorCutUsd:      creatorCut,
        totalSubscribers:   totalSubs,
        mrrUsd:             Number((totalSubs * subPrice).toFixed(2)),
      })

      // First-subscriber milestone (only for the very first paid subscriber, never sent before)
      if (totalSubs === 1 && !isReturn) {
        await sendFirstSubscriberMilestone({
          creatorUserId:      meta.creator_id,
          creatorEmail:       creatorUser.email,
          creatorDisplayName: creator.display_name ?? null,
          creatorUsername:    creator.username,
          fanUsername:        fan.username,
        })
      }
    }

    // Subscription receipt to the fan
    const { data: { user: fanUser } } = await supabase.auth.admin.getUserById(meta.fan_id)
    if (fanUser?.email) {
      await sendSubscriptionReceipt({
        fanUserId:        meta.fan_id,
        fanEmail:         fanUser.email,
        fanDisplayName:   fan.display_name ?? null,
        fanUsername:      fan.username,
        creatorName:      creator.display_name || creator.username,
        creatorUsername:  creator.username,
        amountUsd:        subPrice,
        isRenewal:        isReturn,
        orderId:          subscription.id,
        card:             null,
        paidAt:           new Date(),
        nextBillingDate:  currentPeriodEnd,
      })
    }
  }
}

async function handleSubscriptionDeleted(supabase: SupabaseClient, event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription
  const meta = subscription.metadata || {}

  await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id)

  if (!meta.fan_id || !meta.creator_id) return

  const firstItem = subscription.items?.data?.[0]
  const accessEnds = firstItem?.current_period_end
    ? new Date(firstItem.current_period_end * 1000)
    : new Date()

  const [{ data: { user: fanUser } }, { data: fan }, { data: creator }] = await Promise.all([
    supabase.auth.admin.getUserById(meta.fan_id),
    supabase.from('profiles').select('username, display_name').eq('id', meta.fan_id).single(),
    supabase.from('profiles').select('username, display_name').eq('id', meta.creator_id).single(),
  ])

  if (fanUser?.email && fan && creator) {
    await sendSubscriptionCanceled({
      fanUserId:       meta.fan_id,
      fanEmail:        fanUser.email,
      fanDisplayName:  fan.display_name ?? null,
      fanUsername:     fan.username,
      creatorName:     creator.display_name || creator.username,
      creatorUsername: creator.username,
      accessEnds,
    })
  }
}

async function handleInvoicePaymentSucceeded(supabase: SupabaseClient, event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice
  // Only handle renewals — first invoice is covered by customer.subscription.created
  if (invoice.billing_reason !== 'subscription_cycle') return

  const subId = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription
  const stripeSubId = typeof subId === 'string' ? subId : subId?.id
  if (!stripeSubId) return

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('fan_id, creator_id, current_period_end')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle()
  if (!sub) return

  const [{ data: { user: fanUser } }, { data: fan }, { data: creator }] = await Promise.all([
    supabase.auth.admin.getUserById(sub.fan_id),
    supabase.from('profiles').select('username, display_name').eq('id', sub.fan_id).single(),
    supabase.from('profiles').select('username, display_name').eq('id', sub.creator_id).single(),
  ])

  if (!fanUser?.email || !fan || !creator) return

  const amountUsd = (invoice.amount_paid ?? 0) / 100
  await sendSubscriptionReceipt({
    fanUserId:       sub.fan_id,
    fanEmail:        fanUser.email,
    fanDisplayName:  fan.display_name ?? null,
    fanUsername:     fan.username,
    creatorName:     creator.display_name || creator.username,
    creatorUsername: creator.username,
    amountUsd,
    isRenewal:       true,
    orderId:         invoice.id ?? stripeSubId,
    card:            null,
    paidAt:          new Date((invoice.created ?? Date.now() / 1000) * 1000),
    nextBillingDate: sub.current_period_end,
  })
}

async function handleInvoicePaymentFailed(supabase: SupabaseClient, event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice
  const subId = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription
  const stripeSubId = typeof subId === 'string' ? subId : subId?.id
  if (!stripeSubId) return

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('fan_id, creator_id, current_period_end')
    .eq('stripe_subscription_id', stripeSubId)
    .maybeSingle()
  if (!sub) return

  const [{ data: { user: fanUser } }, { data: fan }, { data: creator }] = await Promise.all([
    supabase.auth.admin.getUserById(sub.fan_id),
    supabase.from('profiles').select('username, display_name').eq('id', sub.fan_id).single(),
    supabase.from('profiles').select('username, display_name').eq('id', sub.creator_id).single(),
  ])

  if (!fanUser?.email || !fan || !creator) return

  const amountUsd = (invoice.amount_due ?? 0) / 100
  // Stripe usually retries 3 times over ~7 days before giving up.
  const accessPausesOn = sub.current_period_end
    ? new Date(sub.current_period_end)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await sendPaymentFailed({
    fanUserId:       sub.fan_id,
    fanEmail:        fanUser.email,
    fanDisplayName:  fan.display_name ?? null,
    fanUsername:     fan.username,
    creatorName:     creator.display_name || creator.username,
    amountUsd,
    card:            null,
    declineReason:   'Your bank declined the charge. Update your payment method to retry.',
    accessPausesOn,
  })
}

async function handleChargeRefunded(supabase: SupabaseClient, event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge
  const meta = charge.metadata || {}
  const fanId = meta.fan_id
  if (!fanId) return

  // Pull the latest refund object — Stripe puts the most recent at index 0
  const refund = charge.refunds?.data?.[0]
  if (!refund) return

  const [{ data: { user: fanUser } }, { data: fan }] = await Promise.all([
    supabase.auth.admin.getUserById(fanId),
    supabase.from('profiles').select('username, display_name').eq('id', fanId).single(),
  ])
  if (!fanUser?.email || !fan) return

  const card = await getCardFromCharge(charge)
  const refundAmountUsd  = (refund.amount ?? 0) / 100
  const originalAmountUsd = (charge.amount ?? 0) / 100

  let originalPurchase = 'Purchase'
  if (meta.type === 'tip')         originalPurchase = 'Tip'
  else if (meta.type === 'ppv')    originalPurchase = 'PPV unlock'
  else if (meta.type === 'message_ppv') originalPurchase = 'PPV message unlock'
  else if (meta.type === 'subscription') originalPurchase = 'Subscription'

  await sendRefundIssued({
    fanUserId:         fanId,
    fanEmail:          fanUser.email,
    fanDisplayName:    fan.display_name ?? null,
    fanUsername:       fan.username,
    refundAmountUsd,
    card,
    originalPurchase,
    originalAmountUsd,
    originalOrderId:   charge.payment_intent ? String(charge.payment_intent) : charge.id,
    originalDate:      new Date(charge.created * 1000),
    refundDate:        new Date((refund.created ?? Date.now() / 1000) * 1000),
    refundId:          refund.id,
    refundReason:      refund.reason ?? 'Refund processed',
  })
}

async function handlePayoutPaid(supabase: SupabaseClient, event: Stripe.Event) {
  const payout = event.data.object as Stripe.Payout
  const stripeAccount = (event.account as string | undefined) ?? undefined
  if (!stripeAccount) return

  const { data: creator } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('stripe_account_id', stripeAccount)
    .single()
  if (!creator) return

  const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(creator.id)
  if (!creatorUser?.email) return

  const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const periodEnd   = new Date()

  // Roll up transactions that landed in this payout window
  const { data: txs } = await supabase
    .from('transactions')
    .select('type, amount_usd')
    .eq('creator_id', creator.id)
    .gte('created_at', periodStart.toISOString())
    .lte('created_at', periodEnd.toISOString())

  const sums = { sub: { count: 0, total: 0 }, ppv: { count: 0, total: 0 }, tip: { count: 0, total: 0 } }
  for (const t of txs ?? []) {
    const bucket = t.type === 'subscription' ? sums.sub
                 : t.type === 'ppv'          ? sums.ppv
                 : t.type === 'tip'          ? sums.tip
                 : null
    if (bucket) { bucket.count += 1; bucket.total += Number(t.amount_usd) }
  }

  await sendPayoutSent({
    creatorUserId:      creator.id,
    creatorEmail:       creatorUser.email,
    creatorDisplayName: creator.display_name ?? null,
    creatorUsername:    creator.username,
    payoutAmountUsd:    (payout.amount ?? 0) / 100,
    periodStart,
    periodEnd,
    arrivalDate:        payout.arrival_date ? new Date(payout.arrival_date * 1000) : new Date(),
    subCount:           sums.sub.count,
    subTotalUsd:        Number(sums.sub.total.toFixed(2)),
    ppvCount:           sums.ppv.count,
    ppvTotalUsd:        Number(sums.ppv.total.toFixed(2)),
    tipCount:           sums.tip.count,
    tipTotalUsd:        Number(sums.tip.total.toFixed(2)),
    refundTotalUsd:     0,
    bankName:           'Bank account',
    bankLast4:          '••••',
    payoutId:           payout.id,
  })
}

async function handlePayoutFailed(supabase: SupabaseClient, event: Stripe.Event) {
  const payout = event.data.object as Stripe.Payout
  const stripeAccount = (event.account as string | undefined) ?? undefined
  if (!stripeAccount) return

  const { data: creator } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('stripe_account_id', stripeAccount)
    .single()
  if (!creator) return

  const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(creator.id)
  if (!creatorUser?.email) return

  await sendPayoutFailed({
    creatorUserId:      creator.id,
    creatorEmail:       creatorUser.email,
    creatorDisplayName: creator.display_name ?? null,
    creatorUsername:    creator.username,
    payoutAmountUsd:    (payout.amount ?? 0) / 100,
    failureReason:      payout.failure_message ?? payout.failure_code ?? 'Bank rejected the deposit',
    bankName:           'Bank account',
    bankLast4:          '••••',
    payoutId:           payout.id,
    attemptedAt:        new Date((payout.created ?? Date.now() / 1000) * 1000),
  })
}

async function handleAccountUpdated(supabase: SupabaseClient, event: Stripe.Event) {
  const account = event.data.object as Stripe.Account
  const updates: Record<string, unknown> = {
    stripe_charges_enabled:   account.charges_enabled,
    stripe_payouts_enabled:   account.payouts_enabled,
    stripe_details_submitted: account.details_submitted,
    updated_at:               new Date().toISOString(),
  }

  // Detect transitions before updating
  const { data: existing } = await supabase
    .from('profiles')
    .select('id, username, display_name, stripe_payouts_enabled')
    .eq('stripe_account_id', account.id)
    .single()

  await supabase
    .from('profiles')
    .update(updates)
    .eq('stripe_account_id', account.id)

  if (!existing) return

  const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(existing.id)
  if (!creatorUser?.email) return

  // Onboarding completed: payouts just flipped from false → true
  const justOnboarded = !existing.stripe_payouts_enabled && account.payouts_enabled
  if (justOnboarded) {
    const externalAccount = account.external_accounts?.data?.[0]
    const isBank = externalAccount && externalAccount.object === 'bank_account'
    const bankLike = isBank ? (externalAccount as Stripe.BankAccount) : null
    const payoutSchedule = account.settings?.payouts?.schedule
    const interval = payoutSchedule?.interval ?? 'weekly'
    const scheduleLabel = interval === 'manual' ? 'Manual' : interval.charAt(0).toUpperCase() + interval.slice(1)

    await sendStripeOnboarded({
      userId:          existing.id,
      toEmail:         creatorUser.email,
      displayName:     existing.display_name ?? null,
      username:        existing.username,
      bankName:        bankLike?.bank_name ?? 'Bank account',
      bankLast4:       bankLike?.last4 ?? '••••',
      payoutSchedule:  scheduleLabel,
      currency:        bankLike?.currency ?? 'usd',
      firstPayoutDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
  }

  // Requirements outstanding — payouts paused
  const dueNow      = account.requirements?.currently_due ?? []
  const pastDue     = account.requirements?.past_due ?? []
  const disabled    = account.requirements?.disabled_reason
  if ((dueNow.length > 0 || pastDue.length > 0) && disabled) {
    // Avoid spamming: only send when this is a fresh restriction
    if (existing.stripe_payouts_enabled) {
      await sendStripeNeedsAttention({
        userId:           existing.id,
        toEmail:          creatorUser.email,
        displayName:      existing.display_name ?? null,
        username:         existing.username,
        requirements:     [...new Set([...pastDue, ...dueNow])],
        deadline:         account.requirements?.current_deadline
          ? new Date(account.requirements.current_deadline * 1000)
          : null,
        pendingBalanceUsd: 0,
      })
    }
  }
}
