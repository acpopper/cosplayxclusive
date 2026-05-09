import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe, getPlatformFeePercent } from '@/lib/stripe'
import { maybeSendAutoMessage, isReturningSubscriber } from '@/lib/auto-message'
import { sendNewFreeFollower } from '@/lib/email'

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
      .single()

    if (existingSub) {
      return NextResponse.json({ error: 'Already subscribed' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const successUrl = `${appUrl}/${creator.username}?subscribed=true`

    // Free creator — grant access directly without Stripe
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

      return NextResponse.json({ url: successUrl })
    }

    if (!creator.stripe_account_id) {
      return NextResponse.json({ error: 'Creator has not set up payouts yet' }, { status: 400 })
    }

    const priceInCents = Math.round(creator.subscription_price_usd * 100)
    const applicationFeePercent = getPlatformFeePercent(creator.platform_fee_percent)

    // Direct-charge subscription on the creator's connected account.
    // Price + customer both live on the connected account; we collect an
    // application fee per period.
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
        customer_email: user.email,
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
