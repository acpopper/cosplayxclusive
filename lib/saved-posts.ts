import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedPost } from './types'

const BUCKET_PRIVATE = 'originals'
const SIGNED_URL_TTL = 3600

function publicPreviewUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${path}`
}

/**
 * Fetch the viewer's bookmarked posts, newest-saved first.
 *
 * Mirrors the shape of getFeedPage so the same FeedPostCard renders both
 * surfaces. Differences vs the home feed:
 *   - Sourced from post_saves, not subscriptions (any creator).
 *   - No cursor pagination — saves are typically a small list per user;
 *     `limit` is the hard ceiling.
 *   - Skips posts whose creator is in either side of a block.
 *   - Skips unpublished posts (creator may have unpublished after a save).
 */
export async function getSavedPosts(
  supabase: SupabaseClient,
  fanId: string,
  limit = 100,
): Promise<FeedPost[]> {
  // 1. Resolve saved post IDs in save-order (newest first).
  const { data: saves } = await supabase
    .from('post_saves')
    .select('post_id, created_at')
    .eq('user_id', fanId)
    .order('created_at', { ascending: false })
    .limit(limit)

  const savedIds = (saves ?? []).map((s: { post_id: string }) => s.post_id)
  if (savedIds.length === 0) return []

  // 2. Fetch posts + viewer-scoped relations in parallel.
  const [postsRes, blocksOutRes, blocksInRes, subsRes, purchasesRes] = await Promise.all([
    supabase
      .from('posts')
      .select(`
        id,
        creator_id,
        caption,
        access_type,
        price_usd,
        media_paths,
        preview_paths,
        media_types,
        published_at,
        creator:profiles!creator_id (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .in('id', savedIds)
      .eq('published', true),
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', fanId),
    supabase.from('user_blocks').select('blocker_id').eq('blocked_id', fanId),
    supabase
      .from('subscriptions')
      .select('creator_id')
      .eq('fan_id', fanId)
      .eq('status', 'active'),
    supabase
      .from('post_purchases')
      .select('post_id')
      .eq('fan_id', fanId)
      .in('post_id', savedIds),
  ])

  const blockedSet = new Set<string>([
    ...((blocksOutRes.data ?? []) as Array<{ blocked_id: string }>).map((b) => b.blocked_id),
    ...((blocksInRes.data  ?? []) as Array<{ blocker_id: string }>).map((b) => b.blocker_id),
  ])
  const subscribedTo = new Set(
    ((subsRes.data ?? []) as Array<{ creator_id: string }>).map((s) => s.creator_id),
  )
  const purchasedSet = new Set(
    ((purchasesRes.data ?? []) as Array<{ post_id: string }>).map((r) => r.post_id),
  )

  type RawPost = {
    id:            string
    creator_id:    string
    caption:       string | null
    access_type:   string
    price_usd:     number | null
    media_paths:   string[]
    preview_paths: string[]
    media_types:   string[] | null
    published_at:  string
    creator:
      | { id: string; username: string; display_name: string | null; avatar_url: string | null }
      | { id: string; username: string; display_name: string | null; avatar_url: string | null }[]
      | null
  }

  // Build a map keyed by post_id, then re-order according to savedIds (DB
  // doesn't guarantee order on .in() queries, and we want save-time order).
  const byId = new Map<string, RawPost>()
  for (const p of (postsRes.data as unknown as RawPost[]) ?? []) {
    if (!blockedSet.has(p.creator_id)) byId.set(p.id, p)
  }
  const orderedPosts = savedIds
    .map((id) => byId.get(id))
    .filter((p): p is RawPost => !!p)

  if (orderedPosts.length === 0) return []
  const postIds = orderedPosts.map((p) => p.id)

  // 3. Engagement aggregates for the visible posts.
  const [likesRes, userLikesRes, commentCountsRes, tipsRes] = await Promise.all([
    supabase.from('post_likes')   .select('post_id')             .in('post_id', postIds),
    supabase.from('post_likes')   .select('post_id')             .in('post_id', postIds).eq('user_id', fanId),
    supabase.from('post_comments').select('post_id')             .in('post_id', postIds),
    supabase.from('post_tips')    .select('post_id, amount_usd') .in('post_id', postIds),
  ])

  const likeCountMap: Record<string, number> = {}
  for (const r of (likesRes.data ?? []) as Array<{ post_id: string }>) {
    likeCountMap[r.post_id] = (likeCountMap[r.post_id] ?? 0) + 1
  }
  const likedSet = new Set(
    ((userLikesRes.data ?? []) as Array<{ post_id: string }>).map((r) => r.post_id),
  )
  const commentCountMap: Record<string, number> = {}
  for (const r of (commentCountsRes.data ?? []) as Array<{ post_id: string }>) {
    commentCountMap[r.post_id] = (commentCountMap[r.post_id] ?? 0) + 1
  }
  const tipsMap: Record<string, number> = {}
  for (const r of (tipsRes.data ?? []) as Array<{ post_id: string; amount_usd: number }>) {
    tipsMap[r.post_id] = (tipsMap[r.post_id] ?? 0) + Number(r.amount_usd)
  }

  // 4. Decorate to FeedPost — sign URLs only for posts the viewer can access.
  return Promise.all(
    orderedPosts.map(async (post) => {
      const creatorRaw = Array.isArray(post.creator) ? post.creator[0] : post.creator
      let hasAccess = false
      if (post.access_type === 'free')                  hasAccess = true
      else if (post.access_type === 'subscriber_only')  hasAccess = subscribedTo.has(post.creator_id)
      else if (post.access_type === 'ppv')              hasAccess = purchasedSet.has(post.id)

      let mediaUrls: string[] = []
      if (hasAccess && post.media_paths?.length > 0) {
        const { data: signed } = await supabase.storage
          .from(BUCKET_PRIVATE)
          .createSignedUrls(post.media_paths, SIGNED_URL_TTL)
        mediaUrls = (signed ?? [])
          .map((s: { signedUrl: string }) => s.signedUrl)
          .filter(Boolean)
      }

      const previewUrls = (post.preview_paths ?? []).map(publicPreviewUrl)
      const rawTypes    = post.media_types ?? []
      const mediaTypes  = post.media_paths.map((_, i) => rawTypes[i] ?? 'image')

      return {
        id:            post.id,
        creator_id:    post.creator_id,
        caption:       post.caption,
        access_type:   post.access_type as FeedPost['access_type'],
        price_usd:     post.price_usd,
        published_at:  post.published_at,
        creator:       creatorRaw ?? { id: post.creator_id, username: '', display_name: null, avatar_url: null },
        mediaUrls,
        previewUrls,
        mediaTypes,
        hasAccess,
        likeCount:    likeCountMap[post.id] ?? 0,
        hasLiked:     likedSet.has(post.id),
        commentCount: commentCountMap[post.id] ?? 0,
        totalTipped:  tipsMap[post.id] ?? 0,
        hasSaved:     true,
      }
    }),
  )
}
