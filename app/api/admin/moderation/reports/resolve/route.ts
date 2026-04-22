import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

/**
 * POST /api/admin/moderation/reports/resolve
 * Body: { postId }
 * Marks every open report for that post as resolved.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { postId } = (await request.json()) as { postId?: string }
  if (!postId) return NextResponse.json({ error: 'postId is required' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('post_reports')
    .update({ resolved_at: new Date().toISOString(), resolved_by: auth.userId })
    .eq('post_id', postId)
    .is('resolved_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
