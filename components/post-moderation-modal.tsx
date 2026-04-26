'use client'

import { useEffect, useState } from 'react'
import type {
  NudityV2,
  SuggestiveClasses,
  OffensiveClasses,
  DetectionScores,
} from '@/lib/sightengine'

interface ModerationItem {
  index:      number
  type:       'image' | 'video'
  scanned:    boolean
  flagged:    boolean
  categories: string[]
  max_score:  number
  scores:     DetectionScores
  url:        string | null
}

interface ModerationResponse {
  post:   { id: string; caption: string | null; creator_id: string; published_at: string }
  items:  ModerationItem[]
  legacy: boolean
}

const INTENSITY_KEYS: Array<keyof NudityV2> = [
  'sexual_activity',
  'sexual_display',
  'erotica',
  'very_suggestive',
  'suggestive',
  'mildly_suggestive',
  'none',
]

const SUGGESTIVE_KEYS: Array<keyof SuggestiveClasses> = [
  'visibly_undressed',
  'sextoy',
  'suggestive_focus',
  'suggestive_pose',
  'lingerie',
  'male_underwear',
  'cleavage',
  'male_chest',
  'nudity_art',
  'schematic',
  'bikini',
  'swimwear_one_piece',
  'swimwear_male',
  'minishort',
  'miniskirt',
  'other',
]

const CONTEXT_KEYS = ['sea_lake_pool', 'outdoor_other', 'indoor_other'] as const

const OFFENSIVE_KEYS: Array<keyof OffensiveClasses> = [
  'nazi',
  'asian_swastika',
  'confederate',
  'supremacist',
  'terrorist',
  'middle_finger',
]

function pct(score: number | undefined): string {
  if (typeof score !== 'number') return '—'
  return `${Math.round(score * 100)}%`
}

function scoreColor(score: number | undefined): string {
  if (typeof score !== 'number') return 'bg-bg-elevated'
  if (score >= 0.5)  return 'bg-error/70'
  if (score >= 0.3)  return 'bg-warning/70'
  if (score >= 0.1)  return 'bg-accent/40'
  return 'bg-bg-elevated'
}

interface ScoreRowProps {
  label:    string
  score:    number | undefined
  flagged:  boolean
}

function ScoreRow({ label, score, flagged }: ScoreRowProps) {
  const value = typeof score === 'number' ? score : 0
  return (
    <div
      className={[
        'flex items-center gap-2 py-1 px-2 rounded text-xs',
        flagged ? 'bg-error/10 ring-1 ring-error/40' : '',
      ].join(' ')}
    >
      <span className={['flex-1 truncate', flagged ? 'font-semibold text-error' : 'text-text-secondary'].join(' ')}>
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
        <div className={['h-full', scoreColor(score)].join(' ')} style={{ width: `${Math.min(100, Math.round(value * 100))}%` }} />
      </div>
      <span className={['w-10 text-right tabular-nums', flagged ? 'text-error font-semibold' : 'text-text-muted'].join(' ')}>
        {pct(score)}
      </span>
    </div>
  )
}

function ItemBlock({ item }: { item: ModerationItem }) {
  const flaggedSet = new Set(item.categories)
  const nudity = item.scores.nudity

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-border bg-bg-base">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <div className="h-24 w-24 flex-shrink-0 rounded-lg overflow-hidden bg-bg-elevated border border-border flex items-center justify-center">
          {item.type === 'video' ? (
            <span className="text-2xl">🎞️</span>
          ) : item.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl">🖼️</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-mono text-text-muted">#{item.index}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">{item.type}</span>
            {item.flagged ? (
              <span className="text-xs px-1.5 py-0.5 rounded bg-error/20 text-error font-semibold">flagged</span>
            ) : item.scanned ? (
              <span className="text-xs px-1.5 py-0.5 rounded bg-success/20 text-success">clean</span>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted">not scanned</span>
            )}
            {item.scanned && (
              <span className="text-xs text-text-muted">
                max {pct(item.max_score)}
              </span>
            )}
          </div>
          {item.categories.length > 0 && (
            <p className="text-xs text-error">
              {item.categories.join(', ')}
            </p>
          )}
        </div>
      </div>

      {item.type === 'video' && (
        <p className="text-xs text-text-muted italic">
          Videos are not currently scanned by SightEngine.
        </p>
      )}

      {item.type === 'image' && !item.scanned && (
        <p className="text-xs text-text-muted italic">
          No moderation data captured for this image. Posts created before the
          media_moderation column existed have no stored scores.
        </p>
      )}

      {item.type === 'image' && item.scanned && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Intensity */}
          {nudity && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">
                Intensity classes
              </p>
              <div className="flex flex-col gap-0.5">
                {INTENSITY_KEYS.map((k) => (
                  <ScoreRow
                    key={k}
                    label={k}
                    score={nudity[k] as number | undefined}
                    flagged={flaggedSet.has(`nudity:${k}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Suggestive */}
          {nudity && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">
                Suggestive classes
              </p>
              <div className="flex flex-col gap-0.5">
                {SUGGESTIVE_KEYS.map((k) => {
                  const v = nudity.suggestive_classes?.[k]
                  return (
                    <ScoreRow
                      key={k}
                      label={k}
                      score={typeof v === 'number' ? v : undefined}
                      flagged={flaggedSet.has(`suggestive:${k}`)}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Context */}
          {nudity?.context && (
            <div className="md:col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">
                Context
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-0.5">
                {CONTEXT_KEYS.map((k) => (
                  <ScoreRow
                    key={k}
                    label={k}
                    score={nudity.context?.[k]}
                    flagged={false}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Offensive content (offensive-2.0) */}
          {item.scores.offensive && (
            <div className="md:col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">
                Offensive content
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0.5">
                {OFFENSIVE_KEYS.map((k) => (
                  <ScoreRow
                    key={k}
                    label={k}
                    score={item.scores.offensive?.[k]}
                    flagged={flaggedSet.has(`offensive:${k}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Faces — minor detection (face-age) */}
          {(item.scores.faces || item.scores.artificial_faces) && (
            <div className="md:col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-text-muted mb-1">
                Faces · minor probability
              </p>
              {(() => {
                const realFaces = item.scores.faces ?? []
                const fakeFaces = item.scores.artificial_faces ?? []
                const total = realFaces.length + fakeFaces.length
                if (total === 0) {
                  return <p className="text-xs text-text-muted px-2 py-1">No faces detected</p>
                }
                const minorFlagged = flaggedSet.has('minor:detected')
                return (
                  <div className="flex flex-col gap-0.5">
                    {realFaces.map((f, i) => (
                      <ScoreRow
                        key={`real-${i}`}
                        label={`face #${i + 1}`}
                        score={f.attributes?.age?.minor}
                        flagged={minorFlagged && (f.attributes?.age?.minor ?? 0) >= 0.5}
                      />
                    ))}
                    {fakeFaces.map((f, i) => (
                      <ScoreRow
                        key={`fake-${i}`}
                        label={`artificial face #${i + 1}`}
                        score={f.attributes?.age?.minor}
                        flagged={minorFlagged && (f.attributes?.age?.minor ?? 0) >= 0.5}
                      />
                    ))}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface PostModerationModalProps {
  postId:  string
  onClose: () => void
}

export function PostModerationModal({ postId, onClose }: PostModerationModalProps) {
  const [data, setData]       = useState<ModerationResponse | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/posts/${postId}/moderation`)
      .then(async (r) => {
        if (!r.ok) {
          const json = await r.json().catch(() => ({}))
          throw new Error(json.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<ModerationResponse>
      })
      .then((json) => { if (!cancelled) setData(json) })
      .catch((e) => { if (!cancelled) setError(e.message ?? 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [postId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-bold text-text-primary">Moderation stats</h2>
            <p className="text-xs text-text-muted">
              Per-image SightEngine scores. Highlighted rows exceeded the auto-flag threshold.
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-bg-elevated hover:bg-bg-base text-text-secondary hover:text-text-primary flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <p className="text-center text-sm text-text-muted py-8">Loading…</p>
          )}
          {error && !loading && (
            <p className="text-center text-sm text-error py-8">{error}</p>
          )}
          {data && !loading && (
            <>
              {data.legacy && (
                <p className="text-xs text-text-muted bg-bg-elevated rounded-lg px-3 py-2 mb-3">
                  This post was created before per-image moderation was being
                  captured — no stored scores are available.
                </p>
              )}
              {data.items.length === 0 ? (
                <p className="text-center text-sm text-text-muted py-8">
                  No media on this post.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {data.items.map((item) => (
                    <ItemBlock key={item.index} item={item} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
