import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { ModerationTabs } from '../tabs'
import { Badge } from '@/components/ui/badge'
import { ReportActions } from './report-actions'
import { getModerationCounts } from '@/lib/moderation-counts'

interface ReportRow {
  id: string
  post_id: string
  reporter_id: string
  reason: string
  details: string | null
  created_at: string
  resolved_at: string | null
}

interface PostRow {
  id: string
  creator_id: string
  caption: string | null
  preview_paths: string[] | null
}

interface ProfileLite {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

const REASON_LABELS: Record<string, string> = {
  violence: 'Violence',
  nudity:   'Nudity',
  underage: 'Underage',
  hate:     'Hate',
  spam:     'Spam',
  other:    'Other',
}

interface ReportsPageProps {
  searchParams: Promise<{ show?: string }>
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const sp = await searchParams
  const showResolved = sp.show === 'resolved'

  const service = createServiceClient()

  let reportsQuery = service
    .from('post_reports')
    .select('id, post_id, reporter_id, reason, details, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (!showResolved) reportsQuery = reportsQuery.is('resolved_at', null)

  const [{ data: reports }, counts] = await Promise.all([
    reportsQuery,
    getModerationCounts(),
  ])

  const reportRows = (reports ?? []) as ReportRow[]

  // Group by post
  const byPost = new Map<
    string,
    {
      reports: ReportRow[]
      reasonCounts: Record<string, number>
    }
  >()
  for (const r of reportRows) {
    const entry = byPost.get(r.post_id) ?? { reports: [], reasonCounts: {} }
    entry.reports.push(r)
    entry.reasonCounts[r.reason] = (entry.reasonCounts[r.reason] ?? 0) + 1
    byPost.set(r.post_id, entry)
  }

  const postIds = Array.from(byPost.keys())
  let posts: PostRow[] = []
  const creatorMap = new Map<string, ProfileLite>()
  const reporterMap = new Map<string, ProfileLite>()

  if (postIds.length > 0) {
    const { data: postData } = await service
      .from('posts')
      .select('id, creator_id, caption, preview_paths')
      .in('id', postIds)
    posts = (postData ?? []) as PostRow[]

    const creatorIds = Array.from(new Set(posts.map((p) => p.creator_id)))
    const reporterIds = Array.from(new Set(reportRows.map((r) => r.reporter_id)))
    const allIds = Array.from(new Set([...creatorIds, ...reporterIds]))

    const { data: profs } = await service
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', allIds)

    for (const p of (profs ?? []) as ProfileLite[]) {
      creatorMap.set(p.id, p)
      reporterMap.set(p.id, p)
    }
  }

  const postMap = new Map(posts.map((p) => [p.id, p]))
  const orderedPostIds = postIds.sort((a, b) => {
    const aLatest = byPost.get(a)!.reports[0].created_at
    const bLatest = byPost.get(b)!.reports[0].created_at
    return aLatest < bLatest ? 1 : -1
  })

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Moderation</h1>
        <p className="text-sm text-text-secondary mt-1">Posts reported by users</p>
      </div>
      <ModerationTabs
        flaggedCount={counts.flaggedChats}
        reportsCount={counts.reports}
        mediaFlagsCount={counts.mediaFlags}
      />

      <div className="flex items-center justify-end mb-3">
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
          <Link
            href="/admin/moderation/reports"
            className={[
              'px-3 py-1.5 transition-colors',
              !showResolved ? 'bg-bg-elevated text-text-primary' : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            Open
          </Link>
          <Link
            href="/admin/moderation/reports?show=resolved"
            className={[
              'px-3 py-1.5 border-l border-border transition-colors',
              showResolved ? 'bg-bg-elevated text-text-primary' : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            Resolved
          </Link>
        </div>
      </div>

      {postIds.length === 0 ? (
        <div className="text-center py-16 text-text-muted bg-bg-card border border-border rounded-2xl">
          <p className="text-3xl mb-3">✓</p>
          <p className="font-medium text-text-secondary">
            {showResolved ? 'No resolved reports' : 'No reports'}
          </p>
          <p className="text-xs text-text-muted mt-1">User reports on posts will appear here.</p>
        </div>
      ) : (
        <div className="bg-bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {orderedPostIds.map((postId) => {
            const post = postMap.get(postId)
            const entry = byPost.get(postId)!
            const creator = post ? creatorMap.get(post.creator_id) : null
            const previewPath = post?.preview_paths?.[0] ?? null
            const previewUrl = previewPath
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${previewPath}`
              : null

            const allResolved = entry.reports.every((r) => r.resolved_at)

            return (
              <div key={postId} className="px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 rounded-xl overflow-hidden bg-bg-elevated flex-shrink-0">
                    {previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-2xl">📷</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {creator && (
                        <Link
                          href={`/${creator.username}`}
                          className="text-sm font-semibold text-text-primary hover:text-accent transition-colors"
                        >
                          @{creator.username}
                        </Link>
                      )}
                      <span className="text-xs text-text-muted">
                        · {entry.reports.length} report{entry.reports.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {post?.caption && (
                      <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{post.caption}</p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(entry.reasonCounts).map(([reason, count]) => (
                        <Badge key={reason} variant="error" className="text-xs">
                          {REASON_LABELS[reason] ?? reason} · {count}
                        </Badge>
                      ))}
                    </div>

                    <ul className="mt-2 space-y-1.5">
                      {entry.reports.slice(0, 5).map((r) => {
                        const reporter = reporterMap.get(r.reporter_id)
                        return (
                          <li key={r.id} className="text-xs text-text-muted">
                            <span className="font-medium text-text-secondary">
                              @{reporter?.username ?? 'unknown'}
                            </span>
                            {' · '}
                            {REASON_LABELS[r.reason] ?? r.reason}
                            {' · '}
                            {new Date(r.created_at).toLocaleString('en-US', {
                              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                            })}
                            {r.details && (
                              <span className="block italic text-text-muted/80 mt-0.5 ml-2">
                                &ldquo;{r.details}&rdquo;
                              </span>
                            )}
                          </li>
                        )
                      })}
                      {entry.reports.length > 5 && (
                        <li className="text-xs text-text-muted italic">
                          …and {entry.reports.length - 5} more
                        </li>
                      )}
                    </ul>
                  </div>

                  {allResolved ? (
                    <Badge variant="muted" className="text-xs flex-shrink-0">Resolved</Badge>
                  ) : (
                    <ReportActions postId={postId} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
