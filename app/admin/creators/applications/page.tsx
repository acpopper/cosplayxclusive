import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { ApprovalButtons } from '../../approval-buttons'
import { ManageButtons } from '../../manage-buttons'
import { CreatorsTabs } from '../tabs'
import type { Profile } from '@/lib/types'

export default async function AdminCreatorsApplicationsPage() {
  const supabase = await createClient()

  const { data: applications } = await supabase
    .from('profiles')
    .select('*')
    .not('creator_status', 'is', null)
    .order('creator_applied_at', { ascending: false })

  const pending   = applications?.filter((a) => a.creator_status === 'pending')   || []
  const approved  = applications?.filter((a) => a.creator_status === 'approved')  || []
  const suspended = applications?.filter((a) => a.creator_status === 'suspended') || []
  const rejected  = applications?.filter((a) => a.creator_status === 'rejected')  || []

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Creators</h1>
        <p className="text-sm text-text-secondary mt-1">
          {pending.length} pending application{pending.length !== 1 ? 's' : ''}
          {suspended.length > 0 && ` · ${suspended.length} suspended`}
        </p>
      </div>

      <CreatorsTabs pendingCount={pending.length} />

      {pending.length > 0 && (
        <Section title="Pending Review">
          {pending.map((creator) => (
            <ApplicationRow key={creator.id} creator={creator as Profile} />
          ))}
        </Section>
      )}

      {approved.length > 0 && (
        <Section title="Active Creators">
          {approved.map((creator) => (
            <ApplicationRow key={creator.id} creator={creator as Profile} />
          ))}
        </Section>
      )}

      {suspended.length > 0 && (
        <Section title="Suspended">
          {suspended.map((creator) => (
            <ApplicationRow key={creator.id} creator={creator as Profile} />
          ))}
        </Section>
      )}

      {rejected.length > 0 && (
        <Section title="Rejected">
          {rejected.map((creator) => (
            <ApplicationRow key={creator.id} creator={creator as Profile} />
          ))}
        </Section>
      )}

      {(!applications || applications.length === 0) && (
        <div className="text-center py-16 text-text-muted bg-bg-card border border-border rounded-2xl">
          <p className="text-3xl mb-3">📋</p>
          <p className="font-medium text-text-secondary">No creator applications yet</p>
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

function ApplicationRow({ creator }: { creator: Profile }) {
  const statusVariant = {
    approved:  'success',
    rejected:  'error',
    suspended: 'warning',
    pending:   'warning',
  }[creator.creator_status ?? 'pending'] as 'success' | 'error' | 'warning'

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

          {creator.creator_application && (
            <div className="mt-2 p-2.5 bg-bg-elevated rounded-lg border border-border">
              <p className="text-xs font-medium text-text-secondary mb-0.5">Application</p>
              <p className="text-xs text-text-muted leading-relaxed whitespace-pre-wrap">
                {creator.creator_application}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Badge variant={statusVariant} className="text-xs capitalize hidden sm:flex">
            {creator.creator_status}
          </Badge>

          {creator.creator_status === 'pending' ? (
            <ApprovalButtons creatorId={creator.id} />
          ) : (
            <ManageButtons creatorId={creator.id} status={creator.creator_status!} />
          )}
        </div>
      </div>
    </div>
  )
}
