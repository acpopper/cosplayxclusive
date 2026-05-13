import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe, getPlatformFeePercent } from '@/lib/stripe'
import { maybeSendAutoMessage, isReturningSubscriber } from '@/lib/auto-message'
import { sendNewFreeFollower } from '@/lib/email'
import type Stripe from 'stripe'

// Subscribe a fan to a creator.
//
// Free creators → no Stripe interaction; we insert an "active" subscription row
// directly. Returns `{ url }` so the client can refresh-via-redirect to pick up
// the new server-rendered subscription state.
//
// Paid creators → direct-charge subscription on the creator's connected
// account. We create (or reuse) a Customer on that account, create the
// Subscription with `default_incomplete` payment behavior, and return the
// first invoice's PaymentIntent `client_secret` so the fan can confirm payment
// inside an embedded Stripe Elements modal — no redirect to Checkout.
export async function POST(request: NextRequest) {
  try {
    const { creatorId } = await request.json()

    if (!creatorId) {
      return NextResponse.json({ error: 'Missing creatorId' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: fanProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!fanProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: creator } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', creatorId)
      .eq('creator_status', 'approved')
      .single()

    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
    }

    if (creator.subscription_price_usd === null || creator.subscription_price_usd === undefined) {
      return NextResponse.json({ error: 'Creator has not set a subscription price' }, { status: 400 })
    }

    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('fan_id', user.id)
      .eq('creator_id', creatorId)
      .eq('status', 'active')
      .maybeSingle()

    if (existingSub) {
      return NextResponse.json({ error: 'Already subscribed' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // ── Free creator: grant access without Stripe ───────────────────────────
    if (creator.subscription_price_usd === 0) {
      const service = createServiceClient()
      const isReturn = await isReturningSubscriber(service, user.id, creatorId)

      const { error: insertError } = await service
        .from('subscriptions')
        .insert({
          fan_id: user.id,
          creator_id: creatorId,
          status: 'active',
        })
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }

      await service.from('notifications').insert({
        user_id: creatorId,
        type: 'new_subscriber',
        payload: {
          fan_id: user.id,
          fan_username: fanProfile.username,
          fan_display_name: fanProfile.display_name,
          fan_avatar_url: fanProfile.avatar_url,
          sub_type: 'free',
        },
      })

      await maybeSendAutoMessage(service, user.id, creatorId, isReturn)

      const { data: { user: creatorUser } } = await service.auth.admin.getUserById(creatorId)
      if (creatorUser?.email) {
        const { count: followerCount } = await service
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', creatorId)
          .eq('status', 'active')
        await sendNewFreeFollower({
          creatorUserId:      creatorId,
          creatorEmail:       creatorUser.email,
          creatorDisplayName: creator.display_name ?? null,
          creatorUsername:    creator.username,
          fanUsername:        fanProfile.username,
          fanDisplayName:     fanProfile.display_name ?? null,
          totalFollowers:     followerCount ?? 1,
        })
      }

      return NextResponse.json({
        kind: 'free',
        url:  `${appUrl}/${creator.username}?subscribed=true`,
      })
    }

    // ── Paid creator: embedded direct-charge subscription ───────────────────
    if (!creator.stripe_account_id) {
      return NextResponse.json({ error: 'Creator has not set up payouts yet' }, { status: 400 })
    }

    const stripeAccount = creator.stripe_account_id as string
    const stripe = getStripe()

    // Customer must live on the connected account for direct-charge subs.
    // Look up by email (so renewals reuse the same customer); create if absent.
    const customers = await stripe.customers.list(
      { email: user.email ?? undefined, limit: 1 },
      { stripeAccount },
    )
    const customer = customers.data[0] ?? await stripe.customers.create(
      { email: user.email ?? undefined, metadata: { fan_id: user.id } },
      { stripeAccount },
    )

    const priceInCents = Math.round(creator.subscription_price_usd * 100)
    const applicationFeePercent = getPlatformFeePercent(creator.platform_fee_percent)

    const price = await stripe.prices.create(
      {
        unit_amount: priceInCents,
        currency: 'usd',
        recurring: { interval: 'month' },
        product_data: {
          name: `${creator.display_name || creator.username} — Monthly Subscription`,
        },
      },
      { stripeAccount },
    )

    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: price.id }],
        application_fee_percent: applicationFeePercent,
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
          payment_method_types: ['card'],
        },
        expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payment_intent'],
        metadata: {
          fan_id: user.id,
          creator_id: creatorId,
        },
      },
      { stripeAccount },
    )

    // Stripe v22: latest_invoice.confirmation_secret is the new home for the
    // client secret used by Elements. We also fall back to payment_intent for
    // older API versions / regional differences.
    const invoice = subscription.latest_invoice as
      | (Stripe.Invoice & {
          confirmation_secret?: { client_secret: string }
          payment_intent?: string | Stripe.PaymentIntent | null
        })
      | null
    const clientSecret =
      invoice?.confirmation_secret?.client_secret
      ?? (typeof invoice?.payment_intent === 'object'
        ? invoice?.payment_intent?.client_secret
        : null)

    if (!clientSecret) {
      console.error('[checkout/subscribe] no client secret on incomplete sub', subscription.id)
      return NextResponse.json({ error: 'Could not initialize payment' }, { status: 500 })
    }

    return NextResponse.json({
      kind:                  'paid',
      clientSecret,
      stripeAccount,
      subscriptionId:        subscription.id,
    })
  } catch (err) {
    console.error('[checkout/subscribe]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
