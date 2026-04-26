import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

const MIN_TIP = 1
const MAX_TIP = 500

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { postId, amount } = await request.json() as { postId: string; amount: number }

    if (!postId || !amount || amount < MIN_TIP || amount > MAX_TIP) {
      return NextResponse.json({ error: `Tip must be between $${MIN_TIP} and $${MAX_TIP}` }, { status: 400 })
    }

    const service = createServiceClient()

    const { data: post } = await service
      .from('posts')
      .select('creator_id, caption')
      .eq('id', postId)
      .single()

    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    if (post.creator_id === user.id) return NextResponse.json({ error: 'Cannot tip your own post' }, { status: 400 })

    const { data: creator } = await service
      .from('profiles')
      .select('username, display_name, stripe_account_id')
      .eq('id', post.creator_id)
      .single()

    if (!creator?.stripe_account_id) {
      return NextResponse.json({ error: 'Creator has not set up payouts' }, { status: 400 })
    }

    // Get or create Stripe customer for fan (on the platform account)
    const { data: fanProfile } = await service
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
      await service.from('profiles').update({ stripe_customer_id: stripeCustomerId }).eq('id', user.id)
    }

    const priceInCents      = Math.round(amount * 100)
    const applicationFeeAmt = Math.round(priceInCents * 0.20)

    // Destination charge: PI lives on platform, funds routed to connected account
    const paymentIntent = await getStripe().paymentIntents.create({
      amount:                  priceInCents,
      currency:                'usd',
      customer:                stripeCustomerId,
      application_fee_amount:  applicationFeeAmt,
      transfer_data:           { destination: creator.stripe_account_id },
      metadata: {
        type:       'tip',
        fan_id:     user.id,
        creator_id: post.creator_id,
        post_id:    postId,
      },
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (err) {
    console.error('[checkout/tip]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
