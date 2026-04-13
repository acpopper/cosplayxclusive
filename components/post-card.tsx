'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Post, Profile } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface PostCardProps {
  post: Post
  creator: Pick<Profile, 'id' | 'username' | 'display_name' | 'subscription_price_usd'>
  hasAccess: boolean
  isSubscribed: boolean
  viewerId: string | null
  previewUrls?: string[]
  mediaUrls?: string[]
}

export function PostCard({
  post,
  creator,
  hasAccess,
  isSubscribed,
  viewerId,
  previewUrls = [],
  mediaUrls = [],
}: PostCardProps) {
  const router = useRouter()
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

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
      const res = await fetch('/api/checkout/ppv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId: post.id }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
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
      <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">

        {/* Media */}
        {displayUrls.length > 0 ? (
          <div className="relative">
            {/* Horizontal scroll strip — swipeable on mobile, clickable on desktop */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {displayUrls.map((url, i) => (
                <div key={i} className="snap-center shrink-0 w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={post.caption || 'Post image'}
                    onClick={() => !isLocked && setLightboxIndex(i)}
                    className={[
                      'w-full max-h-[560px] object-cover select-none',
                      !isLocked ? 'cursor-pointer' : '',
                      isLocked ? 'blur-2xl scale-105' : '',
                    ].join(' ')}
                  />
                </div>
              ))}
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
            <div className="flex gap-1.5">
              {post.access_type === 'free' && (
                <Badge variant="muted" className="text-xs">Free</Badge>
              )}
              {hasAccess && post.access_type !== 'free' && (
                <Badge variant="success" className="text-xs">Unlocked</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrls[lightboxIndex]}
            alt=""
            className="max-h-screen max-w-full object-contain select-none"
            onClick={e => e.stopPropagation()}
            draggable={false}
          />

          {/* Close */}
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            ✕
          </button>

          {/* Prev */}
          {lightboxIndex > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxIndex(i => i !== null ? i - 1 : i) }}
              className="absolute left-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-3xl leading-none flex items-center justify-center transition-colors"
              aria-label="Previous image"
            >
              ‹
            </button>
          )}

          {/* Next */}
          {lightboxIndex < displayUrls.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxIndex(i => i !== null ? i + 1 : i) }}
              className="absolute right-4 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-3xl leading-none flex items-center justify-center transition-colors"
              aria-label="Next image"
            >
              ›
            </button>
          )}

          {/* Counter */}
          {displayUrls.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-3 py-1 rounded-full">
              {lightboxIndex + 1} / {displayUrls.length}
            </div>
          )}
        </div>
      )}
    </>
  )
}
