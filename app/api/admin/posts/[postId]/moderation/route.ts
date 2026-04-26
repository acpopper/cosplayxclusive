import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import type { DetectionScores } from '@/lib/sightengine'

interface ModerationEntry {
  index:      number
  type:       'image' | 'video'
  scanned:    boolean
  flagged:    boolean
  categories: string[]
  max_score:  number
  scores:     DetectionScores
}

type RouteContext = { params: Promise<{ postId: string }> }

/**
 * GET /api/admin/posts/[postId]/moderation
 *
 * Admin-only. Returns per-media SightEngine scores for a post, plus signed
 * URLs to the originals so the modal can display each image alongside its
 * raw scores. Posts created before media_moderation existed return items=[].
 */
export async function GET(_request: Request, ctx: RouteContext) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { postId } = await ctx.params
  if (!postId) {
    return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: post, error } = await service
    .from('posts')
    .select('id, caption, creator_id, media_paths, media_types, media_moderation, published_at')
    .eq('id', postId)
    .single()

  if (error || !post) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
  }

  const mediaPaths      = (post.media_paths      ?? []) as string[]
  const mediaTypes      = (post.media_types      ?? []) as string[]
  const mediaModeration = (post.media_moderation ?? null) as ModerationEntry[] | null

  // Sign every original URL in one batch (1hr TTL, same as feed)
  const signedUrlMap = new Map<number, string>()
  if (mediaPaths.length > 0) {
    const { data: signed } = await service.storage
      .from('originals')
      .createSignedUrls(mediaPaths, 3600)
    ;(signed ?? []).forEach((s, i) => {
      if (s.signedUrl) signedUrlMap.set(i, s.signedUrl)
    })
  }

  // Merge stored moderation with media_paths order. If a post predates the
  // media_moderation column, return one entry per slot with scanned=false.
  const items = mediaPaths.map((_path, i) => {
    const stored = mediaModeration?.find((m) => m.index === i)
    const fallbackType: 'image' | 'video' =
      mediaTypes[i] === 'video' ? 'video' : 'image'
    return {
      index:      i,
      type:       stored?.type       ?? fallbackType,
      scanned:    stored?.scanned    ?? false,
      flagged:    stored?.flagged    ?? false,
      categories: stored?.categories ?? [],
      max_score:  stored?.max_score  ?? 0,
      scores:     stored?.scores     ?? {},
      url:        signedUrlMap.get(i) ?? null,
    }
  })

  return NextResponse.json({
    post: {
      id:           post.id,
      caption:      post.caption,
      creator_id:   post.creator_id,
      published_at: post.published_at,
    },
    items,
    // True when the post has no stored moderation data at all (created before
    // the column existed). The modal uses this to surface a friendly notice.
    legacy: mediaModeration === null,
  })
}
