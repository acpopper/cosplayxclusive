import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { Badge } from '@/components/ui/badge'
import { ApprovalButtons } from './approval-buttons'
import { ManageButtons } from './manage-buttons'
import type { Profile } from '@/lib/types'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/explore')

  const { data: applications } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'creator')
    .in('creator_status', ['pending', 'approved', 'rejected', 'suspended'])
    .order('created_at', { ascending: false })

  const pending   = applications?.filter((a) => a.creator_status === 'pending')   || []
  const approved  = applications?.filter((a) => a.creator_status === 'approved')  || []
  const suspended = applications?.filter((a) => a.creator_status === 'suspended') || []
  const rejected  = applications?.filter((a) => a.creator_status === 'rejected')  || []

  return (
    <div className="min-h-screen bg-bg-base">
      <Nav profile={profile as Profile} />

      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary">Admin Panel</h1>
          <p className="text-sm text-text-secondary mt-1">
            {pending.length} pending application{pending.length !== 1 ? 's' : ''}
            {suspended.length > 0 && ` · ${suspended.length} suspended`}
          </p>
        </div>

        {/* Pending */}
        {pending.length > 0 && (
          <Section title="Pending Review">
            {pending.map((creator) => (
              <ApplicationRow key={creator.id} creator={creator as Profile} />
            ))}
          </Section>
        )}

        {/* Active creators */}
        {approved.length > 0 && (
          <Section title="Active Creators">
            {approved.map((creator) => (
              <ApplicationRow key={creator.id} creator={creator as Profile} />
            ))}
          </Section>
        )}

        {/* Suspended */}
        {suspended.length > 0 && (
          <Section title="Suspended">
            {suspended.map((creator) => (
              <ApplicationRow key={creator.id} creator={creator as Profile} />
            ))}
          </Section>
        )}

        {/* Rejected */}
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
      </main>
    </div>
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

  return (
    <div className="flex items-center gap-4 px-4 py-4">
      {/* Avatar */}
      <div className="h-10 w-10 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
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

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-text-primary">
            {creator.display_name || creator.username}
          </p>
          <p className="text-xs text-text-muted">@{creator.username}</p>
        </div>
        {creator.bio && (
          <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{creator.bio}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-text-muted">
            ${creator.subscription_price_usd}/mo
          </span>
          {creator.fandom_tags?.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="muted" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Status & actions */}
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
  )
}
