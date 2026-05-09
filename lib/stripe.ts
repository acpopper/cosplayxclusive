import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return _stripe
}

export { Stripe }

const DEFAULT_FEE_FALLBACK = 20

// Default platform fee from env (DEFAULT_STRIPE_FEE). Falls back to 20%.
export function getDefaultPlatformFeePercent(): number {
  const raw = process.env.DEFAULT_STRIPE_FEE
  if (!raw) return DEFAULT_FEE_FALLBACK
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    console.warn(`[stripe] DEFAULT_STRIPE_FEE="${raw}" is invalid, falling back to ${DEFAULT_FEE_FALLBACK}%`)
    return DEFAULT_FEE_FALLBACK
  }
  return parsed
}

// Resolve the effective fee for a single transaction. Pass the creator's
// `platform_fee_percent` override; null/undefined → use the default.
export function resolvePlatformFeePercent(creatorOverride?: number | null): number {
  if (creatorOverride !== null && creatorOverride !== undefined) {
    if (Number.isFinite(creatorOverride) && creatorOverride >= 0 && creatorOverride <= 100) {
      return creatorOverride
    }
    console.warn(`[stripe] platform_fee_percent override "${creatorOverride}" is invalid, using default`)
  }
  return getDefaultPlatformFeePercent()
}

// Back-compat alias — call sites that don't have an override yet still work.
export function getPlatformFeePercent(creatorOverride?: number | null): number {
  return resolvePlatformFeePercent(creatorOverride)
}

export function applicationFeeCents(amountCents: number, creatorOverride?: number | null): number {
  return Math.round(amountCents * (resolvePlatformFeePercent(creatorOverride) / 100))
}

export function creatorNetMultiplier(creatorOverride?: number | null): number {
  return 1 - resolvePlatformFeePercent(creatorOverride) / 100
}

export function creatorNetUsd(grossUsd: number, creatorOverride?: number | null): number {
  return Number((grossUsd * creatorNetMultiplier(creatorOverride)).toFixed(2))
}

export function getPlatformWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
  return secret
}

export function getConnectWebhookSecret(): string {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_CONNECT_WEBHOOK_SECRET is not set')
  return secret
}
