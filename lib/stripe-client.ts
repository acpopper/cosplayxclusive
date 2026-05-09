import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js'

const cache = new Map<string, Promise<StripeJs | null>>()

function publishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!key) throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set')
  return key
}

// Direct-charge PaymentIntents live on the connected account, so Stripe.js must
// be initialized with the matching `stripeAccount` for confirmPayment to work.
// We cache one loader per account id (including '' for the platform).
export function loadStripeForAccount(stripeAccount: string | null | undefined): Promise<StripeJs | null> {
  const key = stripeAccount ?? ''
  const existing = cache.get(key)
  if (existing) return existing

  const promise = stripeAccount
    ? loadStripe(publishableKey(), { stripeAccount })
    : loadStripe(publishableKey())
  cache.set(key, promise)
  return promise
}
