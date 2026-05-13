import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe, getPlatformFeePercent } from '@/lib/stripe'
import { ConnectButton } from './connect-button'

// Avoid caching this page — Stripe state can change at any time and we want
// page renders to reflect the freshest capability flags.
export const dynamic = 'force-dynamic'

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

  // Always reconcile with Stripe when an account exists and any capability
  // isn't fully enabled. This makes the page self-healing even if
  // `account.updated` webhooks aren't being delivered (misconfigured endpoint,
  // wrong signing secret, etc.) and ensures the "partial completion" warning
  // accurately reflects Stripe's view of the account.
  let accountStatus: { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean } | null = null

  if (profile.stripe_account_id) {
    const cached = {
      charges_enabled:   !!profile.stripe_charges_enabled,
      payouts_enabled:   !!profile.stripe_payouts_enabled,
      details_submitted: !!profile.stripe_details_submitted,
    }
    accountStatus = cached

    const fullyEnabled = cached.charges_enabled && cached.payouts_enabled && cached.details_submitted
    if (!fullyEnabled) {
      try {
        const account = await getStripe().accounts.retrieve(profile.stripe_account_id)
        const live = {
          charges_enabled:   !!account.charges_enabled,
          payouts_enabled:   !!account.payouts_enabled,
          details_submitted: !!account.details_submitted,
        }
        accountStatus = live

        // Persist any drift so other pages and downstream queries see fresh
        // values without another Stripe roundtrip.
        const drifted =
          live.charges_enabled   !== cached.charges_enabled   ||
          live.payouts_enabled   !== cached.payouts_enabled   ||
          live.details_submitted !== cached.details_submitted
        if (drifted) {
          await createServiceClient()
            .from('profiles')
            .update({
              stripe_charges_enabled:   live.charges_enabled,
              stripe_payouts_enabled:   live.payouts_enabled,
              stripe_details_submitted: live.details_submitted,
              updated_at:               new Date().toISOString(),
            })
            .eq('id', profile.id)
        }
      } catch (err) {
        console.error('[connect/page] live account retrieve failed:', err)
        // Fall back to cached values — better than nothing
      }
    }
  }

  const feePercent = getPlatformFeePercent()
  const creatorPercent = (100 - feePercent).toFixed(0)

  const needsGuide = !accountStatus || !accountStatus.details_submitted

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Payout Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Connect your Stripe account to receive earnings from subscriptions, tips, and pay-per-view purchases.
        </p>
      </div>

      {needsGuide && (
        <a
          href="/stripe-setup-guide.pdf"
          download
          className="inline-flex items-center gap-2 self-start rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent hover:bg-accent/10 hover:border-accent/50 transition-colors max-w-xl"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M4 8a2 2 0 012-2h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H18a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
          </svg>
          <span className="font-medium">Before you start</span>
          <span className="text-text-muted">— download our Stripe setup guide (PDF)</span>
        </a>
      )}

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
