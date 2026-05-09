import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe, applicationFeeCents } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    const { messageId } = await request.json()
    if (!messageId) {
      return NextResponse.json({ error: 'Missing messageId' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: message } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, price_usd')
      .eq('id', messageId)
      .single()

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    if (!message.price_usd || message.price_usd < 1) {
      return NextResponse.json({ error: 'Message is not PPV' }, { status: 400 })
    }
    if (message.sender_id === user.id) {
      return NextResponse.json({ error: 'Cannot purchase your own message' }, { status: 400 })
    }

    const { data: conversation } = await supabase
      .from('conversations')
      .select('participant_a, participant_b')
      .eq('id', message.conversation_id)
      .maybeSingle()
    if (!conversation || (conversation.participant_a !== user.id && conversation.participant_b !== user.id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: existing } = await supabase
      .from('message_purchases')
      .select('id')
      .eq('fan_id',     user.id)
      .eq('message_id', messageId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: 'Already purchased' }, { status: 400 })
    }

    const { data: creator } = await supabase
      .from('profiles')
      .select('id, stripe_account_id, platform_fee_percent')
      .eq('id', message.sender_id)
      .single()
    if (!creator?.stripe_account_id) {
      return NextResponse.json({ error: 'Creator has not set up payouts' }, { status: 400 })
    }

    const priceInCents      = Math.round(message.price_usd * 100)
    const applicationFeeAmt = applicationFeeCents(priceInCents, creator.platform_fee_percent)

    // Direct charge on the creator's connected account.
    const paymentIntent = await getStripe().paymentIntents.create(
      {
        amount:                 priceInCents,
        currency:               'usd',
        application_fee_amount: applicationFeeAmt,
        receipt_email:          user.email,
        metadata: {
          type:       'message_ppv',
          fan_id:     user.id,
          creator_id: creator.id,
          message_id: messageId,
        },
      },
      { stripeAccount: creator.stripe_account_id },
    )

    return NextResponse.json({
      clientSecret:  paymentIntent.client_secret,
      stripeAccount: creator.stripe_account_id,
    })
  } catch (err) {
    console.error('[checkout/message-ppv]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    )
  }
}
