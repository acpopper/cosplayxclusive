import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * POST   /api/user/block  { targetId }   — block a user
 * DELETE /api/user/block  { targetId }   — unblock a user
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { targetId } = (await request.json()) as { targetId?: string }
  if (!targetId) return NextResponse.json({ error: 'targetId is required' }, { status: 400 })
  if (targetId === user.id) return NextResponse.json({ error: 'Cannot block yourself' }, { status: 400 })

  const service = createServiceClient()

  const { data: target } = await service
    .from('profiles')
    .select('id, role')
    .eq('id', targetId)
    .maybeSingle()

  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (target.role === 'admin') {
    return NextResponse.json({ error: 'Cannot block an administrator' }, { status: 400 })
  }

  const { error } = await service
    .from('user_blocks')
    .upsert(
      { blocker_id: user.id, blocked_id: targetId },
      { onConflict: 'blocker_id,blocked_id' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { targetId } = (await request.json()) as { targetId?: string }
  if (!targetId) return NextResponse.json({ error: 'targetId is required' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('user_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', targetId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
