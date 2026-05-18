import type { Profile } from '@/lib/types'

/**
 * Tiny visual indicator of where a creator stands in Stripe Connect onboarding.
 * Renders in Stripe's brand blue (#635BFF) so admins can spot it next to the
 * generic creator-status badge without confusing the two.
 *
 * Three states:
 *   - "Not connected"   — no stripe_account_id (creator hasn't started)
 *   - "Stripe pending"  — account created but capabilities not yet enabled
 *   - "Stripe OK"       — charges + payouts enabled and details submitted
 */
export type StripeStage = 'none' | 'pending' | 'ok'

export function getStripeStage(p: Pick<Profile,
  'stripe_account_id'
  | 'stripe_charges_enabled'
  | 'stripe_payouts_enabled'
  | 'stripe_details_submitted'
>): StripeStage {
  if (!p.stripe_account_id) return 'none'
  const fully = !!p.stripe_charges_enabled && !!p.stripe_payouts_enabled && !!p.stripe_details_submitted
  return fully ? 'ok' : 'pending'
}

export function StripeStatusPill({ stage, className = '' }: { stage: StripeStage; className?: string }) {
  const label =
    stage === 'ok'      ? 'Stripe OK'      :
    stage === 'pending' ? 'Stripe pending' :
                          'Stripe not connected'

  // Outline-ish styles when not connected (we want it muted), solid Stripe-blue
  // for pending, brighter for OK. Hex literals are needed because Stripe brand
  // blue isn't part of the project palette.
  const palette =
    stage === 'ok'
      ? 'bg-[#635BFF]/20 text-[#8c87ff] border-[#635BFF]/40'
      : stage === 'pending'
      ? 'bg-[#635BFF]/10 text-[#a8a4ff] border-[#635BFF]/30'
      : 'bg-bg-elevated text-text-muted border-border'

  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap',
        palette,
        className,
      ].join(' ')}
      title={
        stage === 'ok'      ? 'Charges and payouts are enabled. Creator can receive money.' :
        stage === 'pending' ? 'Account created but onboarding is not complete. Creator cannot yet receive payouts.' :
                              'Creator has not started Stripe Connect onboarding yet.'
      }
    >
      <span
        className={[
          'inline-block h-1.5 w-1.5 rounded-full',
          stage === 'ok'      ? 'bg-[#8c87ff]' :
          stage === 'pending' ? 'bg-[#a8a4ff] animate-pulse' :
                                'bg-text-muted',
        ].join(' ')}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}
