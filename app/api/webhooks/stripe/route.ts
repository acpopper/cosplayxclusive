import { NextRequest, NextResponse } from 'next/server'
import { getStripe, getPlatformWebhookSecret } from '@/lib/stripe'
import { handleStripeEvent } from '@/lib/stripe-webhook-handler'

// Platform webhook — receives events that occur on the platform's own Stripe
// account (account.updated for connected accounts, refund/dispute events on
// platform-collected fees, etc.).
//
// Direct-charge payment & subscription events fire on the *connected* account;
// they're handled by the Connect endpoint at /api/webhooks/stripe/connect.
export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, getPlatformWebhookSecret())
  } catch (err) {
    console.error('[webhook/platform] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    await handleStripeEvent(event)
    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('[webhook/platform] handler error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }
}
