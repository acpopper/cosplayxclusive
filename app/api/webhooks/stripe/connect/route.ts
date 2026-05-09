import { NextRequest, NextResponse } from 'next/server'
import { getStripe, getConnectWebhookSecret } from '@/lib/stripe'
import { handleStripeEvent } from '@/lib/stripe-webhook-handler'

// Connect webhook — receives events that occur on connected accounts. With
// direct charges, this is where we observe payment_intent.succeeded for tips,
// PPV, and message-PPV, and customer.subscription.* for paid subscriptions.
//
// Configure this endpoint in the Stripe Dashboard under Developers → Webhooks
// with the "Listen to events from connected accounts" option enabled, then
// copy the resulting signing secret into STRIPE_CONNECT_WEBHOOK_SECRET.
export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, getConnectWebhookSecret())
  } catch (err) {
    console.error('[webhook/connect] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    await handleStripeEvent(event)
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[webhook/connect] handler error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }
}
