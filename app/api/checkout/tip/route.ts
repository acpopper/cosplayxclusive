import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe, applicationFeeCents } from '@/lib/stripe'

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
      .select('username, display_name, stripe_account_id, platform_fee_percent')
      .eq('id', post.creator_id)
      .single()

    if (!creator?.stripe_account_id) {
      return NextResponse.json({ error: 'Creator has not set up payouts' }, { status: 400 })
    }

    const priceInCents      = Math.round(amount * 100)
    const applicationFeeAmt = applicationFeeCents(priceInCents, creator.platform_fee_percent)

    // Direct charge on the creator's connected account.
    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount:                  priceInCents,
        currency:                'usd',
        application_fee_amount:  applicationFeeAmt,
        receipt_email:           user.email,
        metadata: {
          type:       'tip',
          fan_id:     user.id,
          creator_id: post.creator_id,
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
    console.error('[checkout/tip]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
