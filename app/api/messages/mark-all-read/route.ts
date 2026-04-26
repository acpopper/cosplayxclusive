import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/messages/mark-all-read
 * Marks every conversation the user participates in as read by upserting
 * conversation_reads.last_read_at = now() for each one.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: convs } = await supabase
    .from('conversations')
    .select('id')
    .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)

  const ids = (convs ?? []).map((c) => c.id)
  if (ids.length === 0) return NextResponse.json({ ok: true, count: 0 })

  const now = new Date().toISOString()
  const rows = ids.map((id) => ({
    conversation_id: id,
    user_id: user.id,
    last_read_at: now,
  }))

  const { error } = await supabase
    .from('conversation_reads')
    .upsert(rows, { onConflict: 'conversation_id,user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, count: ids.length })
}
