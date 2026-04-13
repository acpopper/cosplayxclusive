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

    // Get post
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

    // Check if already purchased
    const { data: existingPurchase } = await supabase
      .from('post_purchases')
      .select('id')
      .eq('fan_id', user.id)
      .eq('post_id', postId)
      .single()

    if (existingPurchase) {
      return NextResponse.json({ error: 'Already purchased' }, { status: 400 })
    }

    // Get creator
    const { data: creator } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', post.creator_id)
      .single()

    if (!creator?.stripe_account_id) {
      return NextResponse.json({ error: 'Creator has not set up payouts' }, { status: 400 })
    }

    // Get or create Stripe customer for fan
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

    const priceInCents = Math.round(post.price_usd * 100)
    const applicationFeeAmount = Math.round(priceInCents * 0.20) // 20% platform fee
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await getStripe().checkout.sessions.create(
      {
        mode: 'payment',
        customer: stripeCustomerId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: priceInCents,
              product_data: {
                name: `${creator.display_name || creator.username} — ${post.caption?.slice(0, 50) || 'Exclusive Content'}`,
              },
            },
          },
        ],
        payment_intent_data: {
          application_fee_amount: applicationFeeAmount,
          metadata: {
            fan_id: user.id,
            creator_id: creator.id,
            post_id: postId,
            type: 'ppv',
          },
        },
        success_url: `${appUrl}/${creator.username}?unlocked=${postId}`,
        cancel_url: `${appUrl}/${creator.username}`,
        metadata: {
          fan_id: user.id,
          creator_id: creator.id,
          post_id: postId,
          type: 'ppv',
        },
      },
      { stripeAccount: creator.stripe_account_id }
    )

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[checkout/ppv]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
