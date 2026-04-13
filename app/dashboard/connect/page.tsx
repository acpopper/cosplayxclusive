import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
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

  // Fetch Stripe account status if connected
  let accountStatus: { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean } | null = null
  if (profile.stripe_account_id) {
    try {
      const account = await getStripe().accounts.retrieve(profile.stripe_account_id)
      accountStatus = {
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      }
    } catch {
      // Account may have been deleted
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Payout Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Connect your Stripe account to receive earnings from subscriptions and PPV purchases.
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
                Connect via Stripe Express — takes about 5 minutes. You&apos;ll receive payouts directly to your bank.
              </p>
            </div>

            <ul className="text-xs text-text-muted space-y-1.5">
              <li>✓ You keep ~80% after platform and Stripe fees</li>
              <li>✓ Payouts sent automatically</li>
              <li>✓ Secure via Stripe</li>
            </ul>

            <ConnectButton profileId={profile.id} hasAccount={false} detailsSubmitted={false} />
          </div>
        )}
      </div>
    </div>
  )
}
