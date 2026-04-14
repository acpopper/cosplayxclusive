import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedPost } from './types'

const BUCKET_PRIVATE = 'originals'
const SIGNED_URL_TTL = 3600 // 1 hour

function publicPreviewUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${path}`
}

/**
 * Fetch a page of feed posts for the given fan.
 * Posts are from creators the fan actively subscribes to, newest first.
 *
 * @param supabase  An authenticated Supabase client (server or service)
 * @param fanId     The viewing fan's user id
 * @param limit     Number of posts to return
 * @param cursor    Exclusive upper bound on published_at (ISO string) for pagination
 */
export async function getFeedPage(
  supabase: SupabaseClient,
  fanId: string,
  limit = 20,
  cursor?: string
): Promise<FeedPost[]> {
  // 1. Get creator ids the fan is actively subscribed to
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('creator_id')
    .eq('fan_id', fanId)
    .eq('status', 'active')

  if (!subs || subs.length === 0) return []

  const creatorIds = subs.map((s: { creator_id: string }) => s.creator_id)

  // 2. Fetch posts with creator profile
  let query = supabase
    .from('posts')
    .select(`
      id,
      creator_id,
      caption,
      access_type,
      price_usd,
      media_paths,
      preview_paths,
      published_at,
      creator:profiles!creator_id (
        id,
        username,
        display_name,
        avatar_url
      )
    `)
    .in('creator_id', creatorIds)
    .eq('published', true)
    .order('published_at', { ascending: false })
    .limit(limit)

  if (cursor) {
    query = query.lt('published_at', cursor)
  }

  const { data: posts } = await query
  if (!posts || posts.length === 0) return []

  const postIds = posts.map((p: { id: string }) => p.id)

  // 3. Fetch aggregates in parallel
  const [likesRes, userLikesRes, commentCountsRes, tipsRes, purchasesRes] = await Promise.all([
    // Total likes per post
    supabase
      .from('post_likes')
      .select('post_id')
      .in('post_id', postIds),

    // Which posts the viewer has liked
    supabase
      .from('post_likes')
      .select('post_id')
      .in('post_id', postIds)
      .eq('user_id', fanId),

    // Comment counts
    supabase
      .from('post_comments')
      .select('post_id')
      .in('post_id', postIds),

    // Total tips per post
    supabase
      .from('post_tips')
      .select('post_id, amount_usd')
      .in('post_id', postIds),

    // PPV purchases
    supabase
      .from('post_purchases')
      .select('post_id')
      .eq('fan_id', fanId)
      .in('post_id', postIds),
  ])

  // Build lookup maps
  const likeCountMap: Record<string, number> = {}
  for (const r of (likesRes.data ?? [])) {
    likeCountMap[r.post_id] = (likeCountMap[r.post_id] ?? 0) + 1
  }

  const likedSet = new Set((userLikesRes.data ?? []).map((r: { post_id: string }) => r.post_id))

  const commentCountMap: Record<string, number> = {}
  for (const r of (commentCountsRes.data ?? [])) {
    commentCountMap[r.post_id] = (commentCountMap[r.post_id] ?? 0) + 1
  }

  const tipsMap: Record<string, number> = {}
  for (const r of (tipsRes.data ?? [])) {
    tipsMap[r.post_id] = (tipsMap[r.post_id] ?? 0) + Number(r.amount_usd)
  }

  const purchasedSet = new Set((purchasesRes.data ?? []).map((r: { post_id: string }) => r.post_id))

  type RawPost = {
    id: string
    creator_id: string
    caption: string | null
    access_type: string
    price_usd: number | null
    media_paths: string[]
    preview_paths: string[]
    published_at: string
    // Supabase infers FK joins as arrays; runtime value is a single object or null
    creator: { id: string; username: string; display_name: string | null; avatar_url: string | null } | { id: string; username: string; display_name: string | null; avatar_url: string | null }[] | null
  }

  // 4. Determine access + generate signed URLs
  const feedPosts: FeedPost[] = await Promise.all(
    (posts as unknown as RawPost[]).map(async (post) => {
      // Normalise the creator join (Supabase may return array or single object)
      const creatorRaw = Array.isArray(post.creator) ? post.creator[0] : post.creator
      let hasAccess = false

      if (post.access_type === 'free') {
        hasAccess = true
      } else if (post.access_type === 'subscriber_only') {
        // Fan is subscribed (we already filtered by active subscriptions)
        hasAccess = creatorIds.includes(post.creator_id)
      } else if (post.access_type === 'ppv') {
        hasAccess = purchasedSet.has(post.id)
      }

      // Generate signed URLs only for posts the viewer can actually access
      let mediaUrls: string[] = []
      if (hasAccess && post.media_paths?.length > 0) {
        const { data: signed } = await supabase.storage
          .from(BUCKET_PRIVATE)
          .createSignedUrls(post.media_paths, SIGNED_URL_TTL)
        mediaUrls = (signed ?? []).map((s: { signedUrl: string }) => s.signedUrl).filter(Boolean)
      }

      // Preview URLs are always public (genuinely blurred server-side on upload)
      const previewUrls: string[] = (post.preview_paths ?? []).map(publicPreviewUrl)

      return {
        id: post.id,
        creator_id: post.creator_id,
        caption: post.caption,
        access_type: post.access_type as FeedPost['access_type'],
        price_usd: post.price_usd,
        published_at: post.published_at,
        creator: creatorRaw ?? { id: post.creator_id, username: '', display_name: null, avatar_url: null },
        mediaUrls,
        previewUrls,
        hasAccess,
        likeCount: likeCountMap[post.id] ?? 0,
        hasLiked: likedSet.has(post.id),
        commentCount: commentCountMap[post.id] ?? 0,
        totalTipped: tipsMap[post.id] ?? 0,
      }
    })
  )

  return feedPosts
}
