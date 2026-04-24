'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { FeedPost, FeedComment } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { ReportPostDialog } from '@/components/report-post-dialog'

// ─── helpers ─────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

const TIP_PRESETS = [1, 5, 10, 25, 50]

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({
  urls,
  types,
  index,
  creatorUsername,
  onClose,
}: {
  urls: string[]
  types: string[]
  index: number
  creatorUsername: string
  onClose: () => void
}) {
  const [i, setI] = useState(index)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setI(p => Math.max(0, p - 1))
      if (e.key === 'ArrowRight') setI(p => Math.min(urls.length - 1, p + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [urls.length, onClose])

  const isVideo = (types[i] ?? 'image') === 'video'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="relative" onClick={e => e.stopPropagation()}>
        {isVideo ? (
          <video
            src={urls[i]}
            controls
            autoPlay
            className="max-h-screen max-w-full object-contain select-none"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={urls[i]}
            alt=""
            className="max-h-screen max-w-full object-contain select-none"
            draggable={false}
          />
        )}
        {isVideo && (
          <div className="absolute bottom-14 right-3 pointer-events-none">
            <div className="bg-black/55 text-white text-xs font-bold px-2 py-1 rounded-md">
              cosplayxclusive.com/@{creatorUsername}
            </div>
          </div>
        )}
      </div>
      <button onClick={onClose} className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors" aria-label="Close">✕</button>
      {i > 0 && (
        <button onClick={e => { e.stopPropagation(); setI(p => p - 1) }} className="absolute left-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-3xl leading-none flex items-center justify-center transition-colors" aria-label="Previous">‹</button>
      )}
      {i < urls.length - 1 && (
        <button onClick={e => { e.stopPropagation(); setI(p => p + 1) }} className="absolute right-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-3xl leading-none flex items-center justify-center transition-colors" aria-label="Next">›</button>
      )}
      {urls.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1 rounded-full">{i + 1} / {urls.length}</div>
      )}
    </div>
  )
}

// ─── Tip modal ────────────────────────────────────────────────────────────────
function TipModal({
  post,
  onClose,
  onTipped,
}: {
  post: FeedPost
  onClose: () => void
  onTipped: (amount: number) => void
}) {
  const [amount, setAmount] = useState<number>(5)
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const finalAmount = custom ? Number(custom) : amount

  async function handleSend() {
    if (!finalAmount || finalAmount <= 0) { setError('Enter a valid amount'); return }
    if (finalAmount < 1 || finalAmount > 500) { setError('Tip must be between $1 and $500'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/checkout/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, amount: finalAmount }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong'); return }
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          {success ? (
            <div className="text-center py-4">
              <p className="text-4xl mb-3">💝</p>
              <p className="font-semibold text-text-primary">Tip sent!</p>
              <p className="text-sm text-text-muted mt-1">${finalAmount} sent to {post.creator.display_name || post.creator.username}</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-text-primary mb-1">Send a tip</h2>
              <p className="text-sm text-text-secondary mb-4">
                Show some love to{' '}
                <span className="font-semibold">{post.creator.display_name || post.creator.username}</span>
              </p>
              <div className="grid grid-cols-5 gap-2 mb-3">
                {TIP_PRESETS.map(p => (
                  <button
                    key={p}
                    onClick={() => { setAmount(p); setCustom('') }}
                    className={['py-2 rounded-xl text-sm font-semibold border transition-colors', amount === p && !custom ? 'bg-accent text-white border-accent' : 'border-border text-text-secondary hover:border-accent hover:text-text-primary'].join(' ')}
                  >
                    ${p}
                  </button>
                ))}
              </div>
              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">$</span>
                <input
                  type="number" min="1" placeholder="Custom amount" value={custom}
                  onChange={e => { setCustom(e.target.value); setAmount(0) }}
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-border bg-bg-elevated text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
              {error && <p className="text-xs text-error mb-3">{error}</p>}
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleSend} disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-50 shadow-[0_0_20px_rgba(224,64,122,0.3)]"
                >
                  {loading ? 'Redirecting…' : `Send $${finalAmount || '—'} tip`}
                </button>
                <button onClick={onClose} disabled={loading} className="w-full py-2.5 rounded-xl text-sm text-text-muted hover:text-text-secondary transition-colors">Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Comment section ──────────────────────────────────────────────────────────
function CommentSection({ post }: { post: FeedPost }) {
  const [comments, setComments] = useState<FeedComment[]>([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [fetched, setFetched] = useState(false)

  const fetchComments = useCallback(async () => {
    if (fetched) return
    setFetching(true)
    const res = await fetch(`/api/posts/comment?postId=${post.id}`)
    if (res.ok) {
      const data = await res.json()
      setComments(data.comments ?? [])
    }
    setFetched(true)
    setFetching(false)
  }, [post.id, fetched])

  useEffect(() => { fetchComments() }, [fetchComments])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/posts/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, body: text }),
      })
      const data = await res.json()
      if (res.ok && data.comment) {
        setComments(prev => [...prev, data.comment as FeedComment])
        setBody('')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {fetching && <p className="text-xs text-text-muted py-2 text-center">Loading…</p>}

      {!fetching && comments.length > 0 && (
        <ul className="flex flex-col gap-2.5 mb-3">
          {comments.map(c => {
            const profile = c.profile
            const initials = (profile?.display_name || profile?.username || '?')[0].toUpperCase()
            return (
              <li key={c.id} className="flex items-start gap-2">
                <div className="h-6 w-6 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0 mt-0.5">
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                      <span className="text-[9px] font-bold text-white">{initials}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-text-primary">{profile?.display_name || profile?.username}</span>
                    <span className="text-[10px] text-text-muted">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-text-secondary leading-snug break-words">{c.body}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text" value={body} onChange={e => setBody(e.target.value)}
          placeholder="Add a comment…" maxLength={1000}
          className="flex-1 rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
        <button type="submit" disabled={!body.trim() || loading} className="px-3 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          Post
        </button>
      </form>
    </div>
  )
}

// ─── Main FeedPostCard ────────────────────────────────────────────────────────
interface FeedPostCardProps {
  post: FeedPost
  viewerId: string
}

export function FeedPostCard({ post, viewerId }: FeedPostCardProps) {
  const displayUrls = post.hasAccess ? post.mediaUrls : post.previewUrls
  const isLocked = !post.hasAccess && post.access_type !== 'free'

  const [slideIndex, setSlideIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [likeCount, setLikeCount] = useState(post.likeCount)
  const [hasLiked, setHasLiked] = useState(post.hasLiked)
  const [likeLoading, setLikeLoading] = useState(false)

  const [showComments, setShowComments] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount)

  const [totalTipped, setTotalTipped] = useState(post.totalTipped)
  const [showTip, setShowTip] = useState(false)

  const [menuOpen, setMenuOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    setSlideIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  function scrollToSlide(idx: number) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' })
    setSlideIndex(idx)
  }

  async function handleLike() {
    if (likeLoading) return
    const wasLiked = hasLiked
    // Optimistic
    setHasLiked(!wasLiked)
    setLikeCount(n => wasLiked ? Math.max(0, n - 1) : n + 1)
    setLikeLoading(true)
    try {
      await fetch('/api/posts/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id, action: wasLiked ? 'unlike' : 'like' }),
      })
    } catch {
      // Revert on failure
      setHasLiked(wasLiked)
      setLikeCount(n => wasLiked ? n + 1 : Math.max(0, n - 1))
    } finally {
      setLikeLoading(false)
    }
  }

  const dateLabel = new Date(post.published_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  // Suppress own-post notification: viewerId check is server-side,
  // but we still need viewerId for the creator check on display
  const isOwnPost = viewerId === post.creator_id

  return (
    <>
      <article className="bg-bg-card border border-border rounded-2xl overflow-hidden">

        {/* ── Creator header ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href={`/${post.creator.username}`} className="flex-shrink-0">
            <div className="h-10 w-10 rounded-full overflow-hidden bg-bg-elevated">
              {post.creator.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.creator.avatar_url} alt={post.creator.display_name || post.creator.username} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                  <span className="text-sm font-bold text-white">{(post.creator.display_name || post.creator.username)[0].toUpperCase()}</span>
                </div>
              )}
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <Link href={`/${post.creator.username}`}>
              <p className="text-sm font-semibold text-text-primary hover:text-accent transition-colors truncate">{post.creator.display_name || post.creator.username}</p>
            </Link>
            <p className="text-xs text-text-muted">{dateLabel}</p>
          </div>
          {post.access_type === 'free' && <Badge variant="muted" className="text-xs">Free</Badge>}
          {post.access_type === 'subscriber_only' && post.hasAccess && <Badge variant="success" className="text-xs">Subscribed</Badge>}
          {post.access_type === 'ppv' && <Badge variant="warning" className="text-xs">{post.hasAccess ? 'Unlocked' : `$${post.price_usd?.toFixed(2)} PPV`}</Badge>}

          {!isOwnPost && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="h-8 w-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                aria-label="Post options"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-20">
                  <button
                    onClick={() => { setMenuOpen(false); setReportOpen(true) }}
                    className="w-full px-3 py-2.5 text-left text-sm text-text-primary hover:bg-bg-elevated transition-colors"
                  >
                    Report post
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Caption ────────────────────────────────────────────────────────── */}
        {post.caption && <p className="px-4 pb-3 text-sm text-text-primary leading-relaxed">{post.caption}</p>}

        {/* ── Media ──────────────────────────────────────────────────────────── */}
        {displayUrls.length > 0 ? (
          <div className="relative">
            <div ref={scrollRef} onScroll={handleScroll} className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {displayUrls.map((url, i) => {
                const mediaType = (post.hasAccess ? post.mediaTypes[i] : 'image') ?? 'image'
                const isVideo = mediaType === 'video'
                return (
                  <div key={i} className="snap-center shrink-0 w-full relative">
                    {isVideo && !isLocked ? (
                      <>
                        <video
                          src={url}
                          controls
                          playsInline
                          className="w-full max-h-[520px] object-cover"
                        />
                        <div className="absolute bottom-12 right-3 pointer-events-none">
                          <div className="bg-black/55 text-white text-xs font-bold px-2 py-1 rounded-md">
                            cosplayxclusive.com/@{post.creator.username}
                          </div>
                        </div>
                      </>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={post.caption || 'Post image'} onClick={() => !isLocked && !isVideo && setLightboxIndex(i)}
                        className={['w-full max-h-[520px] object-cover select-none', !isLocked && !isVideo ? 'cursor-pointer' : '', isLocked ? 'blur-2xl scale-105' : ''].join(' ')}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {!isLocked && displayUrls.length > 1 && slideIndex > 0 && (
              <button onClick={() => scrollToSlide(slideIndex - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white text-xl leading-none flex items-center justify-center hover:bg-black/80 transition-colors" aria-label="Previous">‹</button>
            )}
            {!isLocked && displayUrls.length > 1 && slideIndex < displayUrls.length - 1 && (
              <button onClick={() => scrollToSlide(slideIndex + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white text-xl leading-none flex items-center justify-center hover:bg-black/80 transition-colors" aria-label="Next">›</button>
            )}
            {!isLocked && displayUrls.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {displayUrls.map((_, i) => (
                  <button key={i} onClick={() => scrollToSlide(i)}
                    className={['rounded-full transition-all duration-200', i === slideIndex ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50'].join(' ')}
                    aria-label={`Image ${i + 1}`}
                  />
                ))}
              </div>
            )}

            {isLocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-sm">
                <span className="text-4xl">{post.access_type === 'ppv' ? '🔒' : '⭐'}</span>
                {post.access_type === 'subscriber_only' && <Badge variant="accent">Subscribers only</Badge>}
                {post.access_type === 'ppv' && <Badge variant="warning">${post.price_usd?.toFixed(2)} PPV</Badge>}
              </div>
            )}
          </div>
        ) : isLocked ? (
          <div className="h-52 bg-gradient-to-br from-accent/10 to-accent-alt/10 flex flex-col items-center justify-center gap-3">
            <span className="text-4xl">{post.access_type === 'ppv' ? '🔒' : '⭐'}</span>
          </div>
        ) : null}

        {/* ── Action bar ─────────────────────────────────────────────────────── */}
        <div className="px-4 py-3 flex items-center gap-4">
          {/* Like */}
          <button onClick={handleLike} disabled={likeLoading || isOwnPost}
            className={['flex items-center gap-1.5 transition-colors group', hasLiked ? 'text-accent' : 'text-text-muted hover:text-accent', isOwnPost ? 'opacity-40 cursor-default' : ''].join(' ')}
            aria-label={hasLiked ? 'Unlike' : 'Like'}
          >
            <svg className="h-5 w-5 transition-transform group-active:scale-125" viewBox="0 0 24 24" fill={hasLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span className="text-sm font-medium">{likeCount > 0 ? likeCount : ''}</span>
          </button>

          {/* Comment */}
          <button
            onClick={() => setShowComments(v => !v)}
            className="flex items-center gap-1.5 text-text-muted hover:text-text-primary transition-colors"
            aria-label="Comments"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-medium">{commentCount > 0 ? commentCount : ''}</span>
          </button>

          {/* Tip */}
          {!isOwnPost && (
            <button onClick={() => setShowTip(true)} className="flex items-center gap-1.5 text-text-muted hover:text-yellow-400 transition-colors" aria-label="Send tip">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {totalTipped > 0 && <span className="text-sm font-medium text-yellow-400">${totalTipped.toFixed(0)}</span>}
            </button>
          )}
        </div>

        {/* ── Comments ───────────────────────────────────────────────────────── */}
        {showComments && (
          <div className="px-4 pb-4">
            <CommentSection
              post={post}
            />
          </div>
        )}
      </article>

      {lightboxIndex !== null && (
        <Lightbox
          urls={displayUrls}
          types={post.hasAccess ? post.mediaTypes : displayUrls.map(() => 'image')}
          index={lightboxIndex}
          creatorUsername={post.creator.username}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {showTip && (
        <TipModal
          post={post}
          onClose={() => setShowTip(false)}
          onTipped={amount => {
            setTotalTipped(n => n + amount)
          }}
        />
      )}

      {reportOpen && (
        <ReportPostDialog postId={post.id} onClose={() => setReportOpen(false)} />
      )}
    </>
  )
}
