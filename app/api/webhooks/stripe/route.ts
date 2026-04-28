import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { maybeSendAutoMessage, isReturningSubscriber } from '@/lib/auto-message'
import { upsertGroupedNotification, maybeSendMilestone } from '@/lib/notifications'
import { sendNewSubscriber, sendNewTip } from '@/lib/email'
import { getPostHogClient } from '@/lib/posthog-server'

// Service role client — no cookie handling needed in webhook
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const meta = session.metadata || {}

        if (meta.type === 'subscription' && meta.fan_id && meta.creator_id) {
          // Subscription checkout completed — subscription.created will also fire
          // We'll handle the actual sub record in customer.subscription.created
          console.log('[webhook] subscription checkout completed for', meta.fan_id)
        }

        if (meta.type === 'tip' && meta.fan_id && meta.post_id && meta.amount_usd) {
          // Record the tip and fire notification + email
          const amount = parseFloat(meta.amount_usd)

          await supabase.from('post_tips').insert({
            post_id:    meta.post_id,
            fan_id:     meta.fan_id,
            amount_usd: amount,
          })

          const [{ data: post }, { data: fan }] = await Promise.all([
            supabase.from('posts').select('creator_id, caption').eq('id', meta.post_id).single(),
            supabase.from('profiles').select('username, display_name, avatar_url').eq('id', meta.fan_id).single(),
          ])

          // Record tip transaction (creator's 80% cut)
          if (post) {
            await supabase.from('transactions').insert({
              creator_id:      post.creator_id,
              fan_id:          meta.fan_id,
              type:            'tip',
              amount_usd:      amount * 0.80,
              stripe_event_id: event.id,
            })
          }

          const phTip = getPostHogClient()
          phTip.capture({ distinctId: meta.fan_id, event: 'tip_completed', properties: { post_id: meta.post_id, amount_usd: amount, creator_id: post?.creator_id } })
          await phTip.shutdown()

          if (post && fan && post.creator_id !== meta.fan_id) {
            const actor = {
              user_id:      meta.fan_id,
              username:     fan.username,
              display_name: fan.display_name,
              avatar_url:   fan.avatar_url,
            }

            const { data: tipsData } = await supabase
              .from('post_tips')
              .select('amount_usd')
              .eq('post_id', meta.post_id)

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

            // Email on first tip notification
            if (newCount === 1) {
              const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(post.creator_id)
              if (creatorUser?.email) {
                const { data: creatorProfile } = await supabase
                  .from('profiles').select('username').eq('id', post.creator_id).single()
                await sendNewTip(
                  creatorUser.email,
                  creatorProfile?.username ?? '',
                  fan.display_name || fan.username,
                  amount,
                  post.caption,
                )
              }
            }
          }
        }

        if (meta.type === 'ppv' && meta.fan_id && meta.post_id) {
          // PPV purchase
          const paymentIntentId =
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : session.payment_intent?.id

          // Get post price
          const { data: post } = await supabase
            .from('posts')
            .select('price_usd, creator_id')
            .eq('id', meta.post_id)
            .single()

          await supabase.from('post_purchases').upsert({
            fan_id: meta.fan_id,
            post_id: meta.post_id,
            stripe_payment_intent_id: paymentIntentId,
            amount_usd: post?.price_usd || 0,
          }, { onConflict: 'fan_id,post_id', ignoreDuplicates: true })

          // Record transaction
          if (post) {
            await supabase.from('transactions').insert({
              creator_id: post.creator_id,
              fan_id: meta.fan_id,
              type: 'ppv',
              amount_usd: post.price_usd * 0.80, // creator's 80% cut
              stripe_event_id: event.id,
            })
          }

          const phPpv = getPostHogClient()
          phPpv.capture({ distinctId: meta.fan_id, event: 'ppv_purchased', properties: { post_id: meta.post_id, amount_usd: post?.price_usd ?? 0, creator_id: post?.creator_id } })
          await phPpv.shutdown()
        }
        break
      }

      // Fires for destination-charge tips and PPV (platform-account PIs)
      case 'payment_intent.succeeded': {
        const pi   = event.data.object
        const meta = pi.metadata || {}
        const amountUsd = pi.amount / 100

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

          if (post) {
            await supabase.from('transactions').insert({
              creator_id:      post.creator_id,
              fan_id:          meta.fan_id,
              type:            'tip',
              amount_usd:      amountUsd * 0.80,
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
              const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(post.creator_id)
              if (creatorUser?.email) {
                const { data: creatorProfile } = await supabase
                  .from('profiles').select('username').eq('id', post.creator_id).single()
                await sendNewTip(
                  creatorUser.email,
                  creatorProfile?.username ?? '',
                  fan.display_name || fan.username,
                  amountUsd,
                  post.caption,
                )
              }
            }
          }
        }

        if (meta.type === 'ppv' && meta.fan_id && meta.post_id) {
          const { data: post } = await supabase
            .from('posts').select('price_usd, creator_id').eq('id', meta.post_id).single()

          await supabase.from('post_purchases').upsert({
            fan_id:                   meta.fan_id,
            post_id:                  meta.post_id,
            stripe_payment_intent_id: pi.id,
            amount_usd:               post?.price_usd || amountUsd,
          }, { onConflict: 'fan_id,post_id', ignoreDuplicates: true })

          if (post) {
            await supabase.from('transactions').insert({
              creator_id:      post.creator_id,
              fan_id:          meta.fan_id,
              type:            'ppv',
              amount_usd:      amountUsd * 0.80,
              stripe_event_id: event.id,
            })
          }
        }

        if (meta.type === 'message_ppv' && meta.fan_id && meta.message_id && meta.creator_id) {
          const { data: message } = await supabase
            .from('messages').select('price_usd').eq('id', meta.message_id).single()

          await supabase.from('message_purchases').upsert({
            fan_id:                   meta.fan_id,
            message_id:               meta.message_id,
            stripe_payment_intent_id: pi.id,
            amount_usd:               message?.price_usd ?? amountUsd,
          }, { onConflict: 'fan_id,message_id', ignoreDuplicates: true })

          await supabase.from('transactions').insert({
            creator_id:      meta.creator_id,
            fan_id:          meta.fan_id,
            type:            'ppv',
            amount_usd:      amountUsd * 0.80,
            stripe_event_id: event.id,
          })

          const phMsg = getPostHogClient()
          phMsg.capture({
            distinctId: meta.fan_id,
            event:      'message_ppv_purchased',
            properties: { message_id: meta.message_id, amount_usd: message?.price_usd ?? amountUsd, creator_id: meta.creator_id },
          })
          await phMsg.shutdown()
        }

        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const meta = subscription.metadata || {}

        if (!meta.fan_id || !meta.creator_id) {
          console.log('[webhook] subscription event missing metadata, skipping')
          break
        }

        // In Stripe v22, current_period_end moved to SubscriptionItem
        const firstItem = subscription.items?.data?.[0]
        const currentPeriodEnd = firstItem?.current_period_end
          ? new Date(firstItem.current_period_end * 1000).toISOString()
          : null

        // Detect returning subscriber BEFORE the upsert overwrites the status
        const isReturn = event.type === 'customer.subscription.created'
          ? await isReturningSubscriber(supabase, meta.fan_id, meta.creator_id)
          : false

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
          { onConflict: 'fan_id,creator_id' }
        )

        // Record transaction + notification for new subscriptions
        if (event.type === 'customer.subscription.created') {
          const { data: creator } = await supabase
            .from('profiles')
            .select('subscription_price_usd')
            .eq('id', meta.creator_id)
            .single()

          if (creator?.subscription_price_usd) {
            await supabase.from('transactions').insert({
              creator_id: meta.creator_id,
              fan_id: meta.fan_id,
              type: 'subscription',
              amount_usd: creator.subscription_price_usd * 0.80,
              stripe_event_id: event.id,
            })
          }

          // Notify creator of new paid subscriber
          const { data: fan } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', meta.fan_id)
            .single()

          if (fan) {
            await supabase.from('notifications').insert({
              user_id: meta.creator_id,
              type: 'new_subscriber',
              payload: {
                fan_id: meta.fan_id,
                fan_username: fan.username,
                fan_display_name: fan.display_name,
                fan_avatar_url: fan.avatar_url,
                sub_type: 'paid',
              },
            })
          }

          const phSub = getPostHogClient()
          phSub.capture({
            distinctId: meta.fan_id,
            event: 'subscription_completed',
            properties: {
              creator_id: meta.creator_id,
              subscription_price_usd: creator?.subscription_price_usd,
              is_returning: isReturn,
              stripe_subscription_id: subscription.id,
            },
          })
          await phSub.shutdown()

          // Send creator's auto-message to new/returning paid subscriber
          await maybeSendAutoMessage(supabase, meta.fan_id, meta.creator_id, isReturn)

          // Email creator about new paid subscriber
          if (fan) {
            const { data: { user: creatorUser } } = await supabase.auth.admin.getUserById(meta.creator_id)
            if (creatorUser?.email) {
              const { data: creatorProfile } = await supabase
                .from('profiles').select('username').eq('id', meta.creator_id).single()
              await sendNewSubscriber(
                creatorUser.email,
                creatorProfile?.username ?? '',
                fan.display_name || fan.username,
                true,
              )
            }
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', subscription.id)
        break
      }

      default:
        console.log(`[webhook] unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[webhook] handler error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }
}
