import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { ModerationTabs } from '../tabs'
import { Badge } from '@/components/ui/badge'
import { FlagActions } from './flag-actions'
import { getModerationCounts } from '@/lib/moderation-counts'
import type { DetectionScores } from '@/lib/sightengine'

interface FlagRow {
  id:                 string
  source_type:        string
  post_id:            string | null
  creator_id:         string
  storage_bucket:     string
  storage_path:       string
  preview_path:       string | null
  flagged_categories: string[]
  max_score:          number
  detection_scores:   DetectionScores
  resolved_at:        string | null
  created_at:         string
}

interface ProfileLite {
  id:           string
  username:     string
  display_name: string | null
  avatar_url:   string | null
}

interface PostLite {
  id:            string
  caption:       string | null
  preview_paths: string[] | null
}

interface MediaFlagsPageProps {
  searchParams: Promise<{ show?: string }>
}

const CATEGORY_LABELS: Record<string, string> = {
  // Intensity classes (model 2.1)
  'nudity:sexual_activity':       'Sexual activity',
  'nudity:sexual_display':        'Sexual display',
  'nudity:erotica':               'Erotica',
  'nudity:very_suggestive':       'Very suggestive',
  'nudity:suggestive':            'Suggestive',
  'nudity:mildly_suggestive':     'Mildly suggestive',
  // Fine-grained suggestive sub-classes
  'suggestive:visibly_undressed': 'Visibly undressed',
  'suggestive:sextoy':            'Sex toy',
  'suggestive:suggestive_focus':  'Suggestive focus',
  'suggestive:suggestive_pose':   'Suggestive pose',
  'suggestive:lingerie':          'Lingerie',
  'suggestive:cleavage':          'Cleavage',
  'suggestive:bikini':            'Bikini',
  'suggestive:swimwear_one_piece': 'Swimwear',
  // Hate / offensive (offensive-2.0)
  'offensive:nazi':               'Nazi',
  'offensive:asian_swastika':     'Asian swastika',
  'offensive:confederate':        'Confederate',
  'offensive:supremacist':        'Supremacist',
  'offensive:terrorist':          'Terrorist',
  'offensive:middle_finger':      'Middle finger',
  // Minor detection (face-age)
  'minor:detected':               'Minor detected',
}

const SOURCE_LABELS: Record<string, string> = {
  post:         'Post',
  auto_message: 'Auto-message',
  message:      'Chat',
}

function maxMinorScore(scores: DetectionScores): number {
  const all = [...(scores.faces ?? []), ...(scores.artificial_faces ?? [])]
  return all.reduce((m, f) => Math.max(m, f.attributes?.age?.minor ?? 0), 0)
}

function categoryScore(scores: DetectionScores, category: string): number {
  const [prefix, key] = category.split(':')

  if (prefix === 'nudity') {
    return (scores.nudity as Record<string, number | undefined> | undefined)?.[key] ?? 0
  }
  if (prefix === 'suggestive') {
    const value = (scores.nudity?.suggestive_classes as Record<string, unknown> | undefined)?.[key]
    return typeof value === 'number' ? value : 0
  }
  if (prefix === 'offensive') {
    return (scores.offensive as Record<string, number | undefined> | undefined)?.[key] ?? 0
  }
  if (prefix === 'minor') {
    return maxMinorScore(scores)
  }
  return 0
}

function scorePercent(scores: DetectionScores, category: string): string {
  return `${Math.round(categoryScore(scores, category) * 100)}%`
}

/** Top non-flagged signals worth showing to admins for additional context. */
function additionalSignals(
  scores: DetectionScores,
  flagged: string[],
): Array<{ key: string; score: number }> {
  const flaggedSet = new Set(flagged)
  const candidates: Array<{ key: string; score: number }> = []

  const nudity = scores.nudity
  if (nudity) {
    for (const k of ['sexual_activity', 'sexual_display', 'erotica', 'very_suggestive', 'suggestive', 'mildly_suggestive'] as const) {
      if (flaggedSet.has(`nudity:${k}`)) continue
      const score = nudity[k] ?? 0
      if (score >= 0.30) candidates.push({ key: `nudity:${k}`, score })
    }

    const sc = (nudity.suggestive_classes ?? {}) as Record<string, unknown>
    for (const k of ['visibly_undressed', 'sextoy', 'suggestive_focus', 'suggestive_pose', 'lingerie', 'cleavage', 'bikini', 'swimwear_one_piece'] as const) {
      if (flaggedSet.has(`suggestive:${k}`)) continue
      const value = sc[k]
      const score = typeof value === 'number' ? value : 0
      if (score >= 0.30) candidates.push({ key: `suggestive:${k}`, score })
    }
  }

  if (scores.offensive) {
    const offensive = scores.offensive as Record<string, number | undefined>
    for (const k of ['nazi', 'asian_swastika', 'confederate', 'supremacist', 'terrorist', 'middle_finger'] as const) {
      if (flaggedSet.has(`offensive:${k}`)) continue
      const score = offensive[k] ?? 0
      if (score >= 0.30) candidates.push({ key: `offensive:${k}`, score })
    }
  }

  if (!flaggedSet.has('minor:detected')) {
    const minor = maxMinorScore(scores)
    if (minor >= 0.30) candidates.push({ key: 'minor:detected', score: minor })
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 3)
}

export default async function MediaFlagsPage({ searchParams }: MediaFlagsPageProps) {
  const sp           = await searchParams
  const showResolved = sp.show === 'resolved'

  const service = createServiceClient()

  let query = service
    .from('image_content_flags')
    .select(
      'id, source_type, post_id, creator_id, storage_bucket, storage_path, preview_path, ' +
      'flagged_categories, max_score, detection_scores, resolved_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (!showResolved) query = query.is('resolved_at', null)

  const [{ data: flags }, counts] = await Promise.all([
    query,
    getModerationCounts(),
  ])
  const flagRows = (flags ?? []) as unknown as FlagRow[]

  // Collect unique creator/post IDs for batch fetching
  const creatorIds = Array.from(new Set(flagRows.map((f) => f.creator_id)))
  const postIds    = Array.from(new Set(flagRows.map((f) => f.post_id).filter(Boolean))) as string[]

  const [profileData, postData] = await Promise.all([
    creatorIds.length > 0
      ? service.from('profiles').select('id, username, display_name, avatar_url').in('id', creatorIds)
      : Promise.resolve({ data: [] }),
    postIds.length > 0
      ? service.from('posts').select('id, caption, preview_paths').in('id', postIds)
      : Promise.resolve({ data: [] }),
  ])

  const profileMap = new Map<string, ProfileLite>()
  for (const p of (profileData.data ?? []) as ProfileLite[]) profileMap.set(p.id, p)

  const postMap = new Map<string, PostLite>()
  for (const p of (postData.data ?? []) as PostLite[]) postMap.set(p.id, p)

  // Generate image URLs: signed for originals, public for previews
  const imageUrlMap = new Map<string, string>()
  await Promise.all(
    flagRows.map(async (f) => {
      if (f.storage_bucket === 'originals') {
        const { data } = await service.storage
          .from('originals')
          .createSignedUrl(f.storage_path, 3600)
        if (data?.signedUrl) imageUrlMap.set(f.id, data.signedUrl)
      } else {
        imageUrlMap.set(
          f.id,
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${f.storage_bucket}/${f.storage_path}`,
        )
      }
    }),
  )

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Moderation</h1>
        <p className="text-sm text-text-secondary mt-1">
          Images flagged by automated nudity detection
        </p>
      </div>
      <ModerationTabs
        flaggedCount={counts.flaggedChats}
        reportsCount={counts.reports}
        mediaFlagsCount={counts.mediaFlags}
      />

      <div className="flex items-center justify-end mb-3">
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
          <Link
            href="/admin/moderation/media-flags"
            className={[
              'px-3 py-1.5 transition-colors',
              !showResolved
                ? 'bg-bg-elevated text-text-primary'
                : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            Open
          </Link>
          <Link
            href="/admin/moderation/media-flags?show=resolved"
            className={[
              'px-3 py-1.5 border-l border-border transition-colors',
              showResolved
                ? 'bg-bg-elevated text-text-primary'
                : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            Resolved
          </Link>
        </div>
      </div>

      {flagRows.length === 0 ? (
        <div className="text-center py-16 text-text-muted bg-bg-card border border-border rounded-2xl">
          <p className="text-3xl mb-3">✓</p>
          <p className="font-medium text-text-secondary">
            {showResolved ? 'No resolved detections' : 'No flagged images'}
          </p>
          <p className="text-xs text-text-muted mt-1">
            Images that trigger the nudity filter will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {flagRows.map((flag) => {
            const creator  = profileMap.get(flag.creator_id)
            const post     = flag.post_id ? postMap.get(flag.post_id) : null
            const imageUrl = imageUrlMap.get(flag.id)

            return (
              <div key={flag.id} className="flex items-start gap-4 px-4 py-4">
                {/* Flagged image thumbnail */}
                <div className="h-20 w-20 rounded-xl overflow-hidden bg-bg-elevated flex-shrink-0 border border-border">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-2xl">🖼️</div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {/* Source type */}
                    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                      {SOURCE_LABELS[flag.source_type] ?? flag.source_type}
                    </span>

                    {/* Creator */}
                    {creator && (
                      <Link
                        href={`/${creator.username}`}
                        className="text-sm font-semibold text-text-primary hover:text-accent transition-colors"
                      >
                        @{creator.username}
                      </Link>
                    )}

                    {/* Link to source */}
                    {flag.source_type === 'post' && post && (
                      <Link
                        href={`/${creator?.username ?? ''}`}
                        className="text-xs text-text-muted hover:text-accent transition-colors"
                      >
                        View post →
                      </Link>
                    )}
                  </div>

                  {/* Caption for posts */}
                  {post?.caption && (
                    <p className="text-xs text-text-muted line-clamp-1 mb-1">{post.caption}</p>
                  )}

                  {/* Flagged categories */}
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {flag.flagged_categories.map((cat) => (
                      <Badge key={cat} variant="error" className="text-xs">
                        {CATEGORY_LABELS[cat] ?? cat}
                        {' · '}
                        {scorePercent(flag.detection_scores, cat)}
                      </Badge>
                    ))}
                  </div>

                  {/* Additional non-flagged signals from the v2.1 response */}
                  {(() => {
                    const extra = additionalSignals(flag.detection_scores, flag.flagged_categories)
                    if (extra.length === 0) return null
                    return (
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {extra.map(({ key, score }) => (
                          <Badge key={key} variant="muted" className="text-[10px]">
                            {CATEGORY_LABELS[key] ?? key}
                            {' · '}
                            {Math.round(score * 100)}%
                          </Badge>
                        ))}
                      </div>
                    )
                  })()}

                  <p className="text-xs text-text-muted">
                    {new Date(flag.created_at).toLocaleString('en-US', {
                      month:  'short',
                      day:    'numeric',
                      hour:   'numeric',
                      minute: '2-digit',
                    })}
                    {flag.resolved_at && (
                      <span className="ml-2 text-success">
                        · Resolved{' '}
                        {new Date(flag.resolved_at).toLocaleString('en-US', {
                          month:  'short',
                          day:    'numeric',
                        })}
                      </span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                {showResolved ? (
                  <Badge variant="muted" className="text-xs flex-shrink-0 self-center">
                    Resolved
                  </Badge>
                ) : (
                  <FlagActions flagId={flag.id} postId={flag.post_id} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
