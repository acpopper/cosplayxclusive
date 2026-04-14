import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { upsertGroupedNotification, maybeSendMilestone } from '@/lib/notifications'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId, amount } = await request.json() as { postId: string; amount: number }
  if (!postId || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Invalid postId or amount' }, { status: 400 })
  }

  const service = createServiceClient()

  // Insert tip (simulated payment)
  const { error: tipErr } = await service
    .from('post_tips')
    .insert({ post_id: postId, fan_id: user.id, amount_usd: amount })

  if (tipErr) return NextResponse.json({ error: tipErr.message }, { status: 500 })

  // Fetch post for creator + caption
  const { data: post } = await service
    .from('posts')
    .select('creator_id, caption')
    .eq('id', postId)
    .single()

  if (!post || post.creator_id === user.id) return NextResponse.json({ ok: true })

  // Fetch tipper profile
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

  // Get the total tipped on this post (for display in notification)
  const { data: tipsData } = await service
    .from('post_tips')
    .select('amount_usd')
    .eq('post_id', postId)

  const totalTipAmount = (tipsData ?? []).reduce((sum, t) => sum + Number(t.amount_usd), 0)
  const tipCount = tipsData?.length ?? 1

  const newCount = await upsertGroupedNotification(service, {
    creatorId: post.creator_id,
    groupKey: `post_tipped:${postId}`,
    type: 'post_tipped',
    actor,
    postId,
    postCaption: post.caption,
    extra: { total_tip_amount: totalTipAmount },
  })

  // Milestone by tip count
  await maybeSendMilestone(service, {
    creatorId: post.creator_id,
    type: 'post_tip_milestone',
    postId,
    postCaption: post.caption,
    count: tipCount,
    extra: { total_tip_amount: totalTipAmount },
  })

  return NextResponse.json({ ok: true, newCount })
}
