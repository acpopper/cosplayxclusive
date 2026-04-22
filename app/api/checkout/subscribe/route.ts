import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { maybeSendAutoMessage, isReturningSubscriber } from '@/lib/auto-message'

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

    // Get fan profile (for Stripe customer)
    const { data: fanProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (!fanProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get creator profile (for price and connected account)
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

    // Check if already subscribed
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('fan_id', user.id)
      .eq('creator_id', creatorId)
      .eq('status', 'active')
      .single()

    if (existingSub) {
      return NextResponse.json({ error: 'Already subscribed' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const successUrl = `${appUrl}/${creator.username}?subscribed=true`

    // Free creator — grant access directly without Stripe
    if (creator.subscription_price_usd === 0) {
      const service = createServiceClient()

      // Detect returning subscriber BEFORE inserting new active record
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

      // Notify creator of their new follower
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

      // Send creator's auto-message (if configured)
      await maybeSendAutoMessage(service, user.id, creatorId, isReturn)

      return NextResponse.json({ url: successUrl })
    }

    if (!creator.stripe_account_id) {
      return NextResponse.json({ error: 'Creator has not set up payouts yet' }, { status: 400 })
    }

    // Get or create Stripe customer for fan
    let stripeCustomerId = fanProfile.stripe_customer_id
    if (!stripeCustomerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      stripeCustomerId = customer.id
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id)
    }

    // Platform fee: 20%
    const priceInCents = Math.round(creator.subscription_price_usd * 100)
    const applicationFeePercent = 20

    // Create a price on the creator's connected account for this subscription
    // We create the price dynamically (simpler for MVP than storing prices)
    const price = await getStripe().prices.create(
      {
        unit_amount: priceInCents,
        currency: 'usd',
        recurring: { interval: 'month' },
        product_data: {
          name: `${creator.display_name || creator.username} — Monthly Subscription`,
        },
      },
      { stripeAccount: creator.stripe_account_id }
    )

    const session = await getStripe().checkout.sessions.create(
      {
        mode: 'subscription',
        customer: stripeCustomerId,
        line_items: [{ price: price.id, quantity: 1 }],
        subscription_data: {
          application_fee_percent: applicationFeePercent,
          metadata: {
            fan_id: user.id,
            creator_id: creatorId,
          },
        },
        success_url: successUrl,
        cancel_url: `${appUrl}/${creator.username}`,
        metadata: {
          fan_id: user.id,
          creator_id: creatorId,
          type: 'subscription',
        },
      },
      { stripeAccount: creator.stripe_account_id }
    )

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[checkout/subscribe]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
