import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

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

    const { data: creator } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', post.creator_id)
      .single()

    if (!creator?.stripe_account_id) {
      return NextResponse.json({ error: 'Creator has not set up payouts' }, { status: 400 })
    }

    // Get or create Stripe customer for fan (on the platform account)
    const { data: fanProfile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single()

    let stripeCustomerId = fanProfile?.stripe_customer_id
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

    const priceInCents       = Math.round(post.price_usd * 100)
    const applicationFeeAmt  = Math.round(priceInCents * 0.20)

    // Destination charge: PI lives on platform, funds routed to connected account
    const paymentIntent = await getStripe().paymentIntents.create({
      amount:                 priceInCents,
      currency:               'usd',
      customer:               stripeCustomerId,
      application_fee_amount: applicationFeeAmt,
      transfer_data:          { destination: creator.stripe_account_id },
      metadata: {
        type:       'ppv',
        fan_id:     user.id,
        creator_id: creator.id,
        post_id:    postId,
      },
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    console.error('[checkout/ppv]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
