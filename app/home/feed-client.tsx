'use client'

import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import type { FeedPost } from '@/lib/types'
import { FeedPostCard } from './feed-post-card'
import { InlineRecommendations } from './inline-recommendations'
import type { RecommendedCreator } from './recommended-creators'

const PAGE_SIZE      = 10
const INJECTION_SLOT = 6   // 0-indexed → position 7 within each 10-post window
const INJECTION_SIZE = 3   // creators per inline suggestion strip

interface FeedClientProps {
  initialPosts:    FeedPost[]
  recommendations: RecommendedCreator[]
  viewerId:        string
  viewerIsAdmin?:  boolean
}

export function FeedClient({
  initialPosts,
  recommendations,
  viewerId,
  viewerIsAdmin = false,
}: FeedClientProps) {
  const [posts, setPosts]     = useState<FeedPost[]>(initialPosts)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialPosts.length === PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef  = useRef(false)

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    setLoading(true)

    try {
      const lastPost = posts[posts.length - 1]
      const cursor = lastPost?.published_at ?? ''
      const res = await fetch(`/api/feed?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}`)
      if (!res.ok) return

      const { posts: next } = await res.json() as { posts: FeedPost[] }
      if (!next || next.length === 0) {
        setHasMore(false)
        return
      }

      setPosts(prev => {
        const ids = new Set(prev.map(p => p.id))
        return [...prev, ...next.filter(p => !ids.has(p.id))]
      })

      if (next.length < PAGE_SIZE) setHasMore(false)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [posts, hasMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  if (posts.length === 0) {
    return (
      <div className="text-center py-20 text-text-muted">
        <p className="text-5xl mb-4">✦</p>
        <p className="text-lg font-medium text-text-secondary">Your feed is empty</p>
        <p className="text-sm mt-2">
          Follow some creators on the{' '}
          <a href="/explore" className="text-accent hover:underline">Explore</a>{' '}
          page to see their posts here.
        </p>
      </div>
    )
  }

  // Pre-compute each inline suggestion strip by slicing the recommendations
  // pool. When the pool is shorter than what the feed needs, we wrap around
  // so longer sessions still get suggestions (some duplicates after the pool
  // is exhausted, but that's acceptable for a discovery rail).
  function sliceFor(injectionIndex: number): RecommendedCreator[] {
    if (recommendations.length === 0) return []
    const start = (injectionIndex * INJECTION_SIZE) % recommendations.length
    const slice: RecommendedCreator[] = []
    for (let i = 0; i < INJECTION_SIZE; i++) {
      slice.push(recommendations[(start + i) % recommendations.length])
    }
    return slice
  }

  return (
    <div className="flex flex-col gap-5">
      {posts.map((post, i) => {
        // Inject a suggestions strip at the 7th slot of every 10-post window
        // (after index 6, 16, 26 ...). The injection itself doesn't shift the
        // 10-post bucketing because the injection-index is derived from `i`.
        const showInjection =
          recommendations.length > 0 && i % PAGE_SIZE === INJECTION_SLOT && i > 0

        const injectionIndex = Math.floor(i / PAGE_SIZE)

        return (
          <Fragment key={post.id}>
            {showInjection && (
              <InlineRecommendations creators={sliceFor(injectionIndex - 1)} />
            )}
            <FeedPostCard
              post={post}
              viewerId={viewerId}
              viewerIsAdmin={viewerIsAdmin}
            />
          </Fragment>
        )
      })}

      <div ref={sentinelRef} className="py-1" />

      {loading && (
        <div className="text-center py-4 text-text-muted text-sm">
          <span className="inline-block animate-pulse">Loading more posts…</span>
        </div>
      )}

      {!hasMore && posts.length > 0 && (
        <div className="text-center py-8 text-text-muted text-sm">
          <span className="text-2xl mb-2 block">✦</span>
          You&apos;re all caught up!
        </div>
      )}
    </div>
  )
}
