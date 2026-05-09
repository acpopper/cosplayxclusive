import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStripe, getPlatformFeePercent } from '@/lib/stripe'
import { ConnectButton } from './connect-button'

export default async function ConnectPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/dashboard')

  // Prefer the cached flags synced via account.updated webhook, but fall back
  // to a live Stripe call when they haven't been populated yet.
  let accountStatus: { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean } | null = null

  if (profile.stripe_account_id) {
    if (
      profile.stripe_charges_enabled !== undefined &&
      profile.stripe_details_submitted !== undefined
    ) {
      accountStatus = {
        charges_enabled:   profile.stripe_charges_enabled,
        payouts_enabled:   profile.stripe_payouts_enabled,
        details_submitted: profile.stripe_details_submitted,
      }
    }

    if (!accountStatus || (!accountStatus.charges_enabled && !accountStatus.details_submitted)) {
      try {
        const account = await getStripe().accounts.retrieve(profile.stripe_account_id)
        accountStatus = {
          charges_enabled:   account.charges_enabled,
          payouts_enabled:   account.payouts_enabled,
          details_submitted: account.details_submitted,
        }
      } catch {
        // Account may have been deleted
      }
    }
  }

  const feePercent = getPlatformFeePercent()
  const creatorPercent = (100 - feePercent).toFixed(0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Payout Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Connect your Stripe account to receive earnings from subscriptions, tips, and pay-per-view purchases.
        </p>
      </div>

      <div className="bg-bg-card border border-border rounded-2xl p-6 max-w-xl">
        {accountStatus ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${accountStatus.charges_enabled ? 'bg-success' : 'bg-warning'}`} />
              <p className="text-sm text-text-primary font-medium">
                {accountStatus.charges_enabled ? 'Account active' : 'Setup incomplete'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-bg-elevated rounded-xl p-3">
                <p className="text-text-muted">Charges</p>
                <p className={`mt-1 font-semibold ${accountStatus.charges_enabled ? 'text-success' : 'text-warning'}`}>
                  {accountStatus.charges_enabled ? '✓ Enabled' : '⚠ Disabled'}
                </p>
              </div>
              <div className="bg-bg-elevated rounded-xl p-3">
                <p className="text-text-muted">Payouts</p>
                <p className={`mt-1 font-semibold ${accountStatus.payouts_enabled ? 'text-success' : 'text-warning'}`}>
                  {accountStatus.payouts_enabled ? '✓ Enabled' : '⚠ Disabled'}
                </p>
              </div>
            </div>

            {!accountStatus.details_submitted && (
              <p className="text-xs text-warning/90 bg-warning/5 border border-warning/20 rounded-lg p-3">
                Your Stripe onboarding is incomplete. Finish setup to enable payouts.
              </p>
            )}

            <ConnectButton
              profileId={profile.id}
              hasAccount={true}
              detailsSubmitted={accountStatus.details_submitted}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-medium text-text-primary text-sm">No payout account connected</p>
              <p className="text-xs text-text-muted mt-1">
                Connect with Stripe to receive payouts. You&apos;ll get a full Stripe dashboard
                to track earnings and manage your account.
              </p>
            </div>

            <ul className="text-xs text-text-muted space-y-1.5">
              <li>✓ You keep {creatorPercent}% of every payment (platform fee: {feePercent}%)</li>
              <li>✓ Payouts sent automatically to your bank</li>
              <li>✓ Full Stripe dashboard for reporting and tax docs</li>
            </ul>

            <ConnectButton profileId={profile.id} hasAccount={false} detailsSubmitted={false} />
          </div>
        )}
      </div>
    </div>
  )
}
