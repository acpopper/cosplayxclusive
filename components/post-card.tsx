'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Post, Profile, FeedComment } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ReportPostDialog } from '@/components/report-post-dialog'
import { PaymentModal } from '@/components/payment-modal'
import { PostModerationModal } from '@/components/post-moderation-modal'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function CommentSection({ postId }: { postId: string }) {
  const [comments, setComments] = useState<FeedComment[]>([])
  const [body, setBody]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    fetch(`/api/posts/comment?postId=${postId}`)
      .then((r) => r.ok ? r.json() : { comments: [] })
      .then((d) => setComments(d.comments ?? []))
      .finally(() => setFetching(false))
  }, [postId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text || loading) return
    setLoading(true)
    try {
      const res  = await fetch('/api/posts/comment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ postId, body: text }),
      })
      const data = await res.json()
      if (res.ok && data.comment) {
        setComments((prev) => [...prev, data.comment as FeedComment])
        setBody('')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 pb-4 border-t border-border pt-3">
      {fetching && <p className="text-xs text-text-muted py-2 text-center">Loading…</p>}

      {!fetching && comments.length > 0 && (
        <ul className="flex flex-col gap-2.5 mb-3">
          {comments.map((c) => {
            const profile  = c.profile
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
          type="text" value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…" maxLength={1000}
          className="flex-1 rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
        <button
          type="submit" disabled={!body.trim() || loading}
          className="px-3 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Post
        </button>
      </form>
    </div>
  )
}

interface PostCardProps {
  post: Post
  creator: Pick<Profile, 'id' | 'username' | 'display_name' | 'subscription_price_usd'>
  hasAccess: boolean
  isSubscribed: boolean
  viewerId: string | null
  viewerIsAdmin?: boolean
  previewUrls?: string[]
  mediaUrls?: string[]
}

export function PostCard({
  post,
  creator,
  hasAccess,
  isSubscribed,
  viewerId,
  viewerIsAdmin = false,
  previewUrls = [],
  mediaUrls = [],
}: PostCardProps) {
  const router = useRouter()
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [ppvSecret, setPpvSecret]             = useState<string | null>(null)
  const [slideIndex, setSlideIndex]           = useState(0)
  const [lightboxIndex, setLightboxIndex]     = useState<number | null>(null)
  const [menuOpen, setMenuOpen]               = useState(false)
  const [reportOpen, setReportOpen]           = useState(false)
  const [moderationOpen, setModerationOpen]   = useState(false)
  const [showComments, setShowComments]       = useState(false)

  const [likeCount, setLikeCount]     = useState(0)
  const [hasLiked, setHasLiked]       = useState(false)
  const [likeLoading, setLikeLoading] = useState(false)

  const [hasSaved, setHasSaved]       = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)

  const menuRef   = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Lazy-fetch like + save state on mount (only when logged in)
  useEffect(() => {
    if (!viewerId) return
    fetch(`/api/posts/like?postId=${post.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setLikeCount(d.likeCount); setHasLiked(d.hasLiked) } })
      .catch(() => {/* ignore */})
    fetch(`/api/posts/save?postId=${post.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setHasSaved(!!d.saved) })
      .catch(() => {/* ignore */})
  }, [post.id, viewerId])

  async function handleLike() {
    if (!viewerId || likeLoading || viewerId === creator.id) return
    const wasLiked = hasLiked
    setHasLiked(!wasLiked)
    setLikeCount((n) => wasLiked ? Math.max(0, n - 1) : n + 1)
    setLikeLoading(true)
    try {
      await fetch('/api/posts/like', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ postId: post.id, action: wasLiked ? 'unlike' : 'like' }),
      })
    } catch {
      setHasLiked(wasLiked)
      setLikeCount((n) => wasLiked ? n + 1 : Math.max(0, n - 1))
    } finally {
      setLikeLoading(false)
    }
  }

  async function handleSave() {
    if (!viewerId || saveLoading) { if (!viewerId) router.push('/login'); return }
    const wasSaved = hasSaved
    setHasSaved(!wasSaved)
    setSaveLoading(true)
    try {
      const res = await fetch('/api/posts/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ postId: post.id, action: wasSaved ? 'unsave' : 'save' }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      setHasSaved(wasSaved)
    } finally {
      setSaveLoading(false)
    }
  }

  const canReport = !!viewerId && viewerId !== creator.id
  const showMenu  = canReport || viewerIsAdmin

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

  const displayUrls = hasAccess ? mediaUrls : previewUrls
  const isLocked = !hasAccess && post.access_type !== 'free'

  async function handleSubscribe() {
    if (!viewerId) { router.push('/login'); return }
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/checkout/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId: creator.id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally { setCheckoutLoading(false) }
  }

  async function handlePPVPurchase() {
    if (!viewerId) { router.push('/login'); return }
    setCheckoutLoading(true)
    try {
      const res  = await fetch('/api/checkout/ppv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id }),
      })
      const data = await res.json()
      if (data.clientSecret) setPpvSecret(data.clientSecret)
    } finally { setCheckoutLoading(false) }
  }

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    setSlideIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  function scrollToSlide(index: number) {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' })
    setSlideIndex(index)
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (lightboxIndex === null) return
    if (e.key === 'ArrowLeft') setLightboxIndex(i => (i !== null && i > 0 ? i - 1 : i))
    if (e.key === 'ArrowRight') setLightboxIndex(i => (i !== null && i < displayUrls.length - 1 ? i + 1 : i))
    if (e.key === 'Escape') setLightboxIndex(null)
  }, [lightboxIndex, displayUrls.length])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    document.body.style.overflow = lightboxIndex !== null ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [lightboxIndex])

  const dateLabel = new Date(post.published_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <>
      <div className="bg-bg-card border border-border rounded-2xl overflow-hidden relative">

        {/* Overflow menu */}
        {showMenu && (
          <div className="absolute top-2 right-2 z-10" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="h-8 w-8 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors backdrop-blur-sm"
              aria-label="Post options"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                {canReport && (
                  <button
                    onClick={() => { setMenuOpen(false); setReportOpen(true) }}
                    className="w-full px-3 py-2.5 text-left text-sm text-text-primary hover:bg-bg-elevated transition-colors"
                  >
                    Report post
                  </button>
                )}
                {viewerIsAdmin && (
                  <button
                    onClick={() => { setMenuOpen(false); setModerationOpen(true) }}
                    className="w-full px-3 py-2.5 text-left text-sm text-text-primary hover:bg-bg-elevated transition-colors border-t border-border"
                  >
                    Moderation stats
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Media */}
        {displayUrls.length > 0 ? (
          <div className="relative">
            {/* Horizontal scroll strip — swipeable on mobile, clickable on desktop */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {displayUrls.map((url, i) => {
                const mediaType = (hasAccess ? (post.media_types ?? [])[i] : 'image') ?? 'image'
                const isVideo = mediaType === 'video'
                return (
                  <div key={i} className="snap-center shrink-0 w-full relative">
                    {isVideo && !isLocked ? (
                      <>
                        <video
                          src={url}
                          controls
                          playsInline
                          className="w-full max-h-[560px] object-cover"
                        />
                        <div className="absolute bottom-12 right-3 pointer-events-none">
                          <div className="bg-black/55 text-white text-xs font-bold px-2 py-1 rounded-md">
                            cosplayxclusive.com/@{creator.username}
                          </div>
                        </div>
                      </>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={post.caption || 'Post image'}
                        onClick={() => !isLocked && !isVideo && setLightboxIndex(i)}
                        className={[
                          'w-full max-h-[560px] object-cover select-none',
                          !isLocked && !isVideo ? 'cursor-pointer' : '',
                          isLocked ? 'blur-2xl scale-105' : '',
                        ].join(' ')}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Prev/Next arrows — visible on desktop when multiple slides */}
            {!isLocked && displayUrls.length > 1 && (
              <>
                {slideIndex > 0 && (
                  <button
                    onClick={() => scrollToSlide(slideIndex - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white text-xl leading-none flex items-center justify-center hover:bg-black/80 transition-colors"
                    aria-label="Previous"
                  >
                    ‹
                  </button>
                )}
                {slideIndex < displayUrls.length - 1 && (
                  <button
                    onClick={() => scrollToSlide(slideIndex + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/60 text-white text-xl leading-none flex items-center justify-center hover:bg-black/80 transition-colors"
                    aria-label="Next"
                  >
                    ›
                  </button>
                )}
              </>
            )}

            {/* Dot indicators */}
            {!isLocked && displayUrls.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {displayUrls.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => scrollToSlide(i)}
                    className={[
                      'rounded-full transition-all duration-200',
                      i === slideIndex
                        ? 'w-4 h-1.5 bg-white'
                        : 'w-1.5 h-1.5 bg-white/50',
                    ].join(' ')}
                    aria-label={`Go to image ${i + 1}`}
                  />
                ))}
              </div>
            )}

            {/* Lock overlay */}
            {isLocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-sm">
                <span className="text-4xl">{post.access_type === 'ppv' ? '🔒' : '⭐'}</span>
                {post.access_type === 'subscriber_only' && (
                  <Badge variant="accent">Subscribers only</Badge>
                )}
                {post.access_type === 'ppv' && (
                  <Badge variant="warning">${post.price_usd?.toFixed(2)} PPV</Badge>
                )}
                {post.access_type === 'subscriber_only' && !isSubscribed && (
                  <Button size="sm" onClick={handleSubscribe} loading={checkoutLoading}>
                    Subscribe · ${creator.subscription_price_usd}/mo
                  </Button>
                )}
                {post.access_type === 'ppv' && (
                  <Button size="sm" onClick={handlePPVPurchase} loading={checkoutLoading}>
                    Unlock · ${post.price_usd?.toFixed(2)}
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* No preview available */
          <div className="h-52 bg-gradient-to-br from-accent/10 to-accent-alt/10 flex flex-col items-center justify-center gap-3">
            <span className="text-4xl">{post.access_type === 'ppv' ? '🔒' : '⭐'}</span>
            {post.access_type === 'subscriber_only' && !isSubscribed && (
              <Button size="sm" onClick={handleSubscribe} loading={checkoutLoading}>
                Subscribe · ${creator.subscription_price_usd}/mo
              </Button>
            )}
            {post.access_type === 'ppv' && (
              <Button size="sm" onClick={handlePPVPurchase} loading={checkoutLoading}>
                Unlock · ${post.price_usd?.toFixed(2)}
              </Button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 flex flex-col gap-1.5">
          {post.caption && (
            <p className="text-sm text-text-primary leading-relaxed">{post.caption}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{dateLabel}</span>
            <div className="flex items-center gap-2">
              {post.access_type === 'free' && (
                <Badge variant="muted" className="text-xs">Free</Badge>
              )}
              {hasAccess && post.access_type !== 'free' && (
                <Badge variant="success" className="text-xs">Unlocked</Badge>
              )}
              {viewerId && viewerId !== creator.id && hasAccess && (
                <button
                  onClick={handleLike}
                  disabled={likeLoading}
                  className={[
                    'flex items-center gap-1 transition-colors',
                    hasLiked ? 'text-accent' : 'text-text-muted hover:text-accent',
                    likeLoading ? 'opacity-60 cursor-not-allowed' : '',
                  ].join(' ')}
                  aria-label={hasLiked ? 'Unlike' : 'Like'}
                >
                  <svg className="h-4 w-4" fill={hasLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                  {likeCount > 0 && <span className="text-xs">{likeCount}</span>}
                </button>
              )}
              {viewerId && hasAccess && (
                <button
                  onClick={() => setShowComments((v) => !v)}
                  className="flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors"
                  aria-label="Toggle comments"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </button>
              )}
              {viewerId && hasAccess && (
                <button
                  onClick={handleSave}
                  disabled={saveLoading}
                  className={[
                    'flex items-center transition-colors',
                    hasSaved ? 'text-accent' : 'text-text-muted hover:text-accent',
                    saveLoading ? 'opacity-60 cursor-not-allowed' : '',
                  ].join(' ')}
                  aria-label={hasSaved ? 'Remove from collections' : 'Save to collections'}
                  aria-pressed={hasSaved}
                >
                  <svg className="h-4 w-4" fill={hasSaved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {showComments && <CommentSection postId={post.id} />}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (() => {
        const lbType = (hasAccess ? (post.media_types ?? [])[lightboxIndex] : 'image') ?? 'image'
        const lbIsVideo = lbType === 'video'
        return (
          <div
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onClick={() => setLightboxIndex(null)}
          >
            <div className="relative" onClick={e => e.stopPropagation()}>
              {lbIsVideo ? (
                <video
                  src={displayUrls[lightboxIndex]}
                  controls
                  autoPlay
                  className="max-h-screen max-w-full object-contain select-none"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayUrls[lightboxIndex]}
                  alt=""
                  className="max-h-screen max-w-full object-contain select-none"
                  draggable={false}
                />
              )}
              {lbIsVideo && (
                <div className="absolute bottom-14 right-3 pointer-events-none">
                  <div className="bg-black/55 text-white text-xs font-bold px-2 py-1 rounded-md">
                    cosplayxclusive.com/@{creator.username}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              ✕
            </button>

            {lightboxIndex > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(i => i !== null ? i - 1 : i) }}
                className="absolute left-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-3xl leading-none flex items-center justify-center transition-colors"
                aria-label="Previous"
              >
                ‹
              </button>
            )}

            {lightboxIndex < displayUrls.length - 1 && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(i => i !== null ? i + 1 : i) }}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-3xl leading-none flex items-center justify-center transition-colors"
                aria-label="Next"
              >
                ›
              </button>
            )}

            {displayUrls.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
                {lightboxIndex + 1} / {displayUrls.length}
              </div>
            )}
          </div>
        )
      })()}

      {ppvSecret && (
        <PaymentModal
          clientSecret={ppvSecret}
          title="Unlock this post"
          subtitle={`Pay $${post.price_usd?.toFixed(2)} to access this exclusive content.`}
          label={`Pay $${post.price_usd?.toFixed(2)}`}
          onSuccess={() => { setPpvSecret(null); router.refresh() }}
          onClose={() => setPpvSecret(null)}
        />
      )}

      {reportOpen && (
        <ReportPostDialog postId={post.id} onClose={() => setReportOpen(false)} />
      )}

      {moderationOpen && (
        <PostModerationModal postId={post.id} onClose={() => setModerationOpen(false)} />
      )}
    </>
  )
}
