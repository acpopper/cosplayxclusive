import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { ManageButtons } from '../../manage-buttons'
import { CreatorFeeInput } from '../../creator-fee-input'
import { CreatorsTabs } from '../tabs'
import { StripeStatusPill, getStripeStage } from '../stripe-status-pill'
import { getDefaultPlatformFeePercent } from '@/lib/stripe'
import type { Profile } from '@/lib/types'

// Manage tab — every approved/suspended creator with admin controls and a
// Stripe enrollment indicator next to the status pill so admins can spot
// who's onboarded vs who still needs to finish Connect.
export default async function AdminCreatorsManagePage() {
  const supabase = await createClient()

  const { data: creators } = await supabase
    .from('profiles')
    .select('*')
    .in('creator_status', ['approved', 'suspended'])
    .order('creator_applied_at', { ascending: false, nullsFirst: false })

  const approved  = (creators ?? []).filter((c) => c.creator_status === 'approved')  as Profile[]
  const suspended = (creators ?? []).filter((c) => c.creator_status === 'suspended') as Profile[]

  // Pending count for the Applications tab badge.
  const { count: pendingCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('creator_status', 'pending')

  const stripePendingCount = (creators ?? []).filter((c) => getStripeStage(c as Profile) !== 'ok').length
  const stripeOkCount      = approved.length + suspended.length - stripePendingCount

  const defaultFee = getDefaultPlatformFeePercent()

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Creators</h1>
        <p className="text-sm text-text-secondary mt-1">
          {approved.length} approved · {suspended.length} suspended · {stripeOkCount} fully on Stripe
        </p>
      </div>

      <CreatorsTabs pendingCount={pendingCount ?? 0} stripePendingCount={stripePendingCount} />

      {approved.length > 0 && (
        <Section title="Approved">
          {approved.map((creator) => (
            <CreatorRow key={creator.id} creator={creator} defaultFee={defaultFee} />
          ))}
        </Section>
      )}

      {suspended.length > 0 && (
        <Section title="Suspended">
          {suspended.map((creator) => (
            <CreatorRow key={creator.id} creator={creator} defaultFee={defaultFee} />
          ))}
        </Section>
      )}

      {approved.length === 0 && suspended.length === 0 && (
        <div className="text-center py-16 text-text-muted bg-bg-card border border-border rounded-2xl">
          <p className="text-3xl mb-3">◈</p>
          <p className="font-medium text-text-secondary">No active creators yet</p>
          <p className="text-xs mt-1">Once you approve an application it shows up here.</p>
        </div>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wider">
        {title}
      </h2>
      <div className="bg-bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
        {children}
      </div>
    </div>
  )
}

function CreatorRow({ creator, defaultFee }: { creator: Profile; defaultFee: number }) {
  const statusVariant = creator.creator_status === 'approved' ? 'success' : 'warning'
  const stripeStage   = getStripeStage(creator)

  const appliedAt = creator.creator_applied_at
    ? new Date(creator.creator_applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0 mt-0.5">
          {creator.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
              <span className="text-sm font-bold text-white">
                {(creator.display_name || creator.username)[0].toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-text-primary">
              {creator.display_name || creator.username}
            </p>
            <p className="text-xs text-text-muted">@{creator.username}</p>
            {appliedAt && (
              <p className="text-xs text-text-muted">· Applied {appliedAt}</p>
            )}
          </div>
          {creator.bio && (
            <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{creator.bio}</p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {creator.subscription_price_usd != null && (
              <span className="text-xs text-text-muted">
                ${creator.subscription_price_usd}/mo
              </span>
            )}
            {creator.fandom_tags?.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="muted" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-3 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Badge variant={statusVariant} className="text-xs capitalize hidden sm:flex">
              {creator.creator_status}
            </Badge>
            <StripeStatusPill stage={stripeStage} />
            <ManageButtons creatorId={creator.id} status={creator.creator_status!} />
          </div>

          <CreatorFeeInput
            creatorId={creator.id}
            initialValue={creator.platform_fee_percent}
            defaultFee={defaultFee}
          />
        </div>
      </div>
    </div>
  )
}
