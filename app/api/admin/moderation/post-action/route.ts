import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

/**
 * POST /api/admin/moderation/post-action
 * Body: { postId, action: 'unpublish' | 'delete' }
 *
 * unpublish — sets posts.published = false and resolves open reports on it.
 * delete    — deletes the post (reports cascade via FK).
 */
export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const { postId, action } = (await request.json()) as {
    postId?: string
    action?: 'unpublish' | 'delete'
  }
  if (!postId) return NextResponse.json({ error: 'postId is required' }, { status: 400 })
  if (action !== 'unpublish' && action !== 'delete') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const service = createServiceClient()

  if (action === 'unpublish') {
    const { error: updateErr } = await service
      .from('posts')
      .update({ published: false })
      .eq('id', postId)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    await service
      .from('post_reports')
      .update({ resolved_at: new Date().toISOString(), resolved_by: auth.userId })
      .eq('post_id', postId)
      .is('resolved_at', null)

    return NextResponse.json({ ok: true, action })
  }

  // action === 'delete'
  const { error: deleteErr } = await service.from('posts').delete().eq('id', postId)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, action })
}
