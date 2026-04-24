import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { upsertGroupedNotification, maybeSendMilestone } from '@/lib/notifications'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const postId = new URL(request.url).searchParams.get('postId')
  if (!postId) return NextResponse.json({ error: 'Missing postId' }, { status: 400 })

  const service = createServiceClient()

  const [countRes, myLikeRes] = await Promise.all([
    service.from('post_likes').select('*', { count: 'exact', head: true }).eq('post_id', postId),
    service.from('post_likes').select('post_id').eq('post_id', postId).eq('user_id', user.id).maybeSingle(),
  ])

  return NextResponse.json({ likeCount: countRes.count ?? 0, hasLiked: !!myLikeRes.data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId, action } = await request.json() as { postId: string; action: 'like' | 'unlike' }
  if (!postId || !action) return NextResponse.json({ error: 'Missing postId or action' }, { status: 400 })

  const service = createServiceClient()

  if (action === 'unlike') {
    await service.from('post_likes').delete().eq('post_id', postId).eq('user_id', user.id)
    return NextResponse.json({ ok: true })
  }

  // ── Like ─────────────────────────────────────────────────────────────────
  const { error: likeErr } = await service
    .from('post_likes')
    .insert({ post_id: postId, user_id: user.id })

  if (likeErr && likeErr.code !== '23505') {
    return NextResponse.json({ error: likeErr.message }, { status: 500 })
  }

  // Fetch post to get creator + caption
  const { data: post } = await service
    .from('posts')
    .select('creator_id, caption')
    .eq('id', postId)
    .single()

  // Don't notify if the creator is liking their own post
  if (!post || post.creator_id === user.id) return NextResponse.json({ ok: true })

  // Fetch liker profile
  const { data: fanProfile } = await service
    .from('profiles')
    .select('username, display_name, avatar_url')
    .eq('id', user.id)
    .single()

  if (!fanProfile) return NextResponse.json({ ok: true })

  const actor = {
    user_id: user.id,
    username: fanProfile.username,
    display_name: fanProfile.display_name,
    avatar_url: fanProfile.avatar_url,
  }

  // Upsert stacked notification + check milestone
  const newCount = await upsertGroupedNotification(service, {
    creatorId: post.creator_id,
    groupKey: `post_liked:${postId}`,
    type: 'post_liked',
    actor,
    postId,
    postCaption: post.caption,
  })

  // Count total likes (for milestone — includes all-time, not just this session)
  const { count: totalLikes } = await service
    .from('post_likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId)

  await maybeSendMilestone(service, {
    creatorId: post.creator_id,
    type: 'post_like_milestone',
    postId,
    postCaption: post.caption,
    count: totalLikes ?? newCount,
  })

  return NextResponse.json({ ok: true })
}
