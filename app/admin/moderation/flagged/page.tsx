import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { ModerationTabs } from '../tabs'
import { FlagResolveButton } from './flag-resolve-button'

interface FlagRow {
  id: string
  message_id: string
  conversation_id: string
  matched_pattern: string
  created_at: string
  resolved_at: string | null
}

interface ConversationRow {
  id: string
  participant_a: string
  participant_b: string
}

interface ProfileLite {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

interface FlaggedConversation {
  conversation_id: string
  participants: ProfileLite[]
  hitCount: number
  lastFlaggedAt: string
  samplePatterns: string[]
}

interface FlaggedChatsPageProps {
  searchParams: Promise<{ show?: string }>
}

export default async function FlaggedChatsPage({ searchParams }: FlaggedChatsPageProps) {
  const sp = await searchParams
  const showResolved = sp.show === 'resolved'

  const service = createServiceClient()

  // Pull flags (unresolved by default) and aggregate in-memory.
  let flagsQuery = service
    .from('flagged_messages')
    .select('id, message_id, conversation_id, matched_pattern, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(500)
  if (!showResolved) flagsQuery = flagsQuery.is('resolved_at', null)

  const { data: flags } = await flagsQuery

  const flagRows = (flags ?? []) as FlagRow[]

  const byConv = new Map<
    string,
    { hitCount: number; lastFlaggedAt: string; samplePatterns: Set<string> }
  >()
  for (const f of flagRows) {
    const entry = byConv.get(f.conversation_id) ?? {
      hitCount: 0,
      lastFlaggedAt: f.created_at,
      samplePatterns: new Set<string>(),
    }
    entry.hitCount += 1
    if (f.created_at > entry.lastFlaggedAt) entry.lastFlaggedAt = f.created_at
    if (entry.samplePatterns.size < 3) entry.samplePatterns.add(f.matched_pattern)
    byConv.set(f.conversation_id, entry)
  }

  const conversationIds = Array.from(byConv.keys())

  let flaggedConversations: FlaggedConversation[] = []
  if (conversationIds.length > 0) {
    const { data: convs } = await service
      .from('conversations')
      .select('id, participant_a, participant_b')
      .in('id', conversationIds)

    const convRows = (convs ?? []) as ConversationRow[]
    const participantIds = new Set<string>()
    for (const c of convRows) {
      participantIds.add(c.participant_a)
      participantIds.add(c.participant_b)
    }

    const { data: profData } = await service
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', Array.from(participantIds))

    const profMap = new Map<string, ProfileLite>()
    for (const p of (profData ?? []) as ProfileLite[]) profMap.set(p.id, p)

    flaggedConversations = convRows
      .map((c) => {
        const entry = byConv.get(c.id)!
        return {
          conversation_id: c.id,
          participants: [profMap.get(c.participant_a), profMap.get(c.participant_b)].filter(
            Boolean,
          ) as ProfileLite[],
          hitCount: entry.hitCount,
          lastFlaggedAt: entry.lastFlaggedAt,
          samplePatterns: Array.from(entry.samplePatterns),
        }
      })
      .sort((a, b) => (a.lastFlaggedAt < b.lastFlaggedAt ? 1 : -1))
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Moderation</h1>
        <p className="text-sm text-text-secondary mt-1">Conversations flagged by warning patterns</p>
      </div>
      <ModerationTabs flaggedCount={showResolved ? undefined : flaggedConversations.length} />

      <div className="flex items-center justify-end mb-3">
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
          <Link
            href="/admin/moderation/flagged"
            className={[
              'px-3 py-1.5 transition-colors',
              !showResolved ? 'bg-bg-elevated text-text-primary' : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            Open
          </Link>
          <Link
            href="/admin/moderation/flagged?show=resolved"
            className={[
              'px-3 py-1.5 border-l border-border transition-colors',
              showResolved ? 'bg-bg-elevated text-text-primary' : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            Resolved
          </Link>
        </div>
      </div>

      {flaggedConversations.length === 0 ? (
        <div className="text-center py-16 text-text-muted bg-bg-card border border-border rounded-2xl">
          <p className="text-3xl mb-3">✓</p>
          <p className="font-medium text-text-secondary">
            {showResolved ? 'No resolved conversations' : 'No flagged conversations'}
          </p>
          <p className="text-xs text-text-muted mt-1">Messages matching a warning pattern will appear here.</p>
        </div>
      ) : (
        <div className="bg-bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {flaggedConversations.map((fc) => (
            <div
              key={fc.conversation_id}
              className="flex items-start gap-3 px-4 py-4 hover:bg-bg-elevated transition-colors"
            >
              <Link
                href={`/admin/moderation/flagged/${fc.conversation_id}`}
                className="flex items-start gap-3 flex-1 min-w-0"
              >
                <div className="flex -space-x-2 flex-shrink-0">
                  {fc.participants.map((p) => (
                    <div
                      key={p.id}
                      className="h-9 w-9 rounded-full overflow-hidden bg-bg-elevated border-2 border-bg-card"
                    >
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                          <span className="text-xs font-bold text-white">
                            {(p.display_name || p.username)[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {fc.participants.map((p) => p.display_name || p.username).join(' · ')}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {fc.samplePatterns.map((pat) => (
                      <code
                        key={pat}
                        className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-error/10 text-error"
                      >
                        {pat}
                      </code>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    {fc.hitCount} flag{fc.hitCount !== 1 ? 's' : ''} · last{' '}
                    {new Date(fc.lastFlaggedAt).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </p>
                </div>
              </Link>

              {showResolved ? (
                <span className="text-xs text-text-muted self-center px-2 py-1 rounded-lg bg-bg-elevated">
                  Resolved
                </span>
              ) : (
                <FlagResolveButton conversationId={fc.conversation_id} />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
