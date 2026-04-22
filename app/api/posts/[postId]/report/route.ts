import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const REASONS = ['violence', 'nudity', 'underage', 'hate', 'spam', 'other'] as const
type Reason = typeof REASONS[number]

export async function POST(
  request: Request,
  props: { params: Promise<{ postId: string }> },
) {
  const { postId } = await props.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { reason?: string; details?: string }
  const reason = body.reason as Reason
  const details = (body.details ?? '').trim() || null

  if (!REASONS.includes(reason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
  }
  if (details && details.length > 500) {
    return NextResponse.json({ error: 'Details too long (max 500 chars)' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: post } = await service
    .from('posts')
    .select('id, creator_id')
    .eq('id', postId)
    .maybeSingle()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.creator_id === user.id) {
    return NextResponse.json({ error: 'You cannot report your own post' }, { status: 400 })
  }

  const { error } = await service
    .from('post_reports')
    .insert({ post_id: postId, reporter_id: user.id, reason, details })

  if (error) {
    // Unique violation → already reported
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, alreadyReported: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
