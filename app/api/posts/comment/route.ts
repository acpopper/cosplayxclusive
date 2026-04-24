import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { upsertGroupedNotification, maybeSendMilestone } from '@/lib/notifications'
import { sendNewComment } from '@/lib/email'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('postId')
  if (!postId) return NextResponse.json({ error: 'Missing postId' }, { status: 400 })

  const { data: comments } = await supabase
    .from('post_comments')
    .select(`
      id,
      post_id,
      user_id,
      body,
      created_at,
      profile:profiles!user_id (
        username,
        display_name,
        avatar_url
      )
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(50)

  return NextResponse.json({ comments: comments ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId, body } = await request.json() as { postId: string; body: string }
  if (!postId || !body?.trim()) {
    return NextResponse.json({ error: 'Missing postId or body' }, { status: 400 })
  }
  if (body.length > 1000) {
    return NextResponse.json({ error: 'Comment too long' }, { status: 400 })
  }

  const service = createServiceClient()

  // Insert comment + return with profile for the UI
  const { data: comment, error: commentErr } = await service
    .from('post_comments')
    .insert({ post_id: postId, user_id: user.id, body: body.trim() })
    .select(`
      id,
      post_id,
      user_id,
      body,
      created_at,
      profile:profiles!user_id (
        username,
        display_name,
        avatar_url
      )
    `)
    .single()

  if (commentErr) return NextResponse.json({ error: commentErr.message }, { status: 500 })

  // Fetch post for creator + caption
  const { data: post } = await service
    .from('posts')
    .select('creator_id, caption')
    .eq('id', postId)
    .single()

  // Don't notify if creator is commenting on own post
  if (!post || post.creator_id === user.id) return NextResponse.json({ comment })

  // Supabase may return the FK join as an array or single object
  const profileRaw = comment.profile as unknown
  const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { username: string; display_name: string | null; avatar_url: string | null } | null

  const actor = {
    user_id: user.id,
    username: profile?.username ?? '',
    display_name: profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
  }

  const newCount = await upsertGroupedNotification(service, {
    creatorId: post.creator_id,
    groupKey: `post_commented:${postId}`,
    type: 'post_commented',
    actor,
    postId,
    postCaption: post.caption,
    extra: { sample_comment: body.trim().slice(0, 80) },
  })

  // Count total comments for milestone
  const { count: totalComments } = await service
    .from('post_comments')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId)

  await maybeSendMilestone(service, {
    creatorId: post.creator_id,
    type: 'post_comment_milestone',
    postId,
    postCaption: post.caption,
    count: totalComments ?? newCount,
  })

  // Email on first comment notification (not every subsequent one)
  if (newCount === 1) {
    const { data: { user: creatorUser } } = await service.auth.admin.getUserById(post.creator_id)
    if (creatorUser?.email) {
      const { data: creatorProfile } = await service
        .from('profiles')
        .select('username')
        .eq('id', post.creator_id)
        .single()
      await sendNewComment(
        creatorUser.email,
        creatorProfile?.username ?? '',
        actor.display_name || actor.username,
        post.caption,
        body.trim(),
      )
    }
  }

  return NextResponse.json({ comment })
}
