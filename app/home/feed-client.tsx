'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { FeedPost } from '@/lib/types'
import { FeedPostCard } from './feed-post-card'

interface FeedClientProps {
  initialPosts: FeedPost[]
  viewerId: string
  viewerIsAdmin?: boolean
}

export function FeedClient({ initialPosts, viewerId, viewerIsAdmin = false }: FeedClientProps) {
  const [posts, setPosts] = useState<FeedPost[]>(initialPosts)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialPosts.length === 20)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return
    loadingRef.current = true
    setLoading(true)

    try {
      const lastPost = posts[posts.length - 1]
      const cursor = lastPost?.published_at ?? ''
      const res = await fetch(`/api/feed?cursor=${encodeURIComponent(cursor)}&limit=20`)
      if (!res.ok) return

      const { posts: next } = await res.json() as { posts: FeedPost[] }
      if (!next || next.length === 0) {
        setHasMore(false)
        return
      }

      setPosts(prev => {
        // Deduplicate by id
        const ids = new Set(prev.map(p => p.id))
        return [...prev, ...next.filter(p => !ids.has(p.id))]
      })

      if (next.length < 20) setHasMore(false)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [posts, hasMore])

  // IntersectionObserver — fire loadMore when sentinel is visible
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: '200px' }
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

  return (
    <div className="flex flex-col gap-5">
      {posts.map(post => (
        <FeedPostCard
          key={post.id}
          post={post}
          viewerId={viewerId}
          viewerIsAdmin={viewerIsAdmin}
        />
      ))}

      {/* Infinite scroll sentinel */}
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
