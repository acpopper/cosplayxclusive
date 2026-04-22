import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

/**
 * POST /api/admin/moderation/flagged/resolve
 * Body: { conversationId }
 * Marks every open flag on that conversation as resolved.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { conversationId } = (await request.json()) as { conversationId?: string }
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('flagged_messages')
    .update({ resolved_at: new Date().toISOString(), resolved_by: auth.userId })
    .eq('conversation_id', conversationId)
    .is('resolved_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
