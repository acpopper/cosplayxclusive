import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, applicationFeeCents } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const { postId } = await request.json()

    if (!postId) {
      return NextResponse.json({ error: 'Missing postId' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: post } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .eq('access_type', 'ppv')
      .single()

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    if (!post.price_usd || post.price_usd < 1) {
      return NextResponse.json({ error: 'Invalid post price' }, { status: 400 })
    }

    const { data: existingPurchase } = await supabase
      .from('post_purchases')
      .select('id')
      .eq('fan_id', user.id)
      .eq('post_id', postId)
      .single()

    if (existingPurchase) {
      return NextResponse.json({ error: 'Already purchased' }, { status: 400 })
    }

    // PPV is gated behind a subscription (free or paid). Fans must opt in to
    // the creator first; otherwise they can't buy individual posts.
    if (user.id !== post.creator_id) {
      const nowIso = new Date().toISOString()
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id, current_period_end')
        .eq('fan_id',     user.id)
        .eq('creator_id', post.creator_id)
        .eq('status',     'active')
        .maybeSingle()

      const hasActiveSub = !!sub && (sub.current_period_end == null || sub.current_period_end > nowIso)
      if (!hasActiveSub) {
        return NextResponse.json(
          { error: 'Subscribe to this creator before unlocking PPV posts.', code: 'subscription_required' },
          { status: 403 },
        )
      }
    }

    const { data: creator } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', post.creator_id)
      .single()

    if (!creator?.stripe_account_id) {
      return NextResponse.json({ error: 'Creator has not set up payouts' }, { status: 400 })
    }

    const priceInCents      = Math.round(post.price_usd * 100)
    const applicationFeeAmt = applicationFeeCents(priceInCents, creator.platform_fee_percent)

    // Direct charge: PaymentIntent is created on the connected account; the
    // platform collects an application fee. Customer/payment-method are scoped
    // to the connected account, so we don't pass a platform `customer`.
    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount:                 priceInCents,
        currency:               'usd',
        application_fee_amount: applicationFeeAmt,
        receipt_email:          user.email,
        metadata: {
          type:       'ppv',
          fan_id:     user.id,
          creator_id: creator.id,
          post_id:    postId,
        },
      },
      { stripeAccount: creator.stripe_account_id },
    )

    return NextResponse.json({
      clientSecret:  paymentIntent.client_secret,
      stripeAccount: creator.stripe_account_id,
    })
  } catch (err) {
    console.error('[checkout/ppv]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
