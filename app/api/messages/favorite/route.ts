import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/messages/favorite
 * Body: { conversationId: string, favorite: boolean }
 * Toggles whether the current user has saved this conversation as a favorite.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId, favorite } = await request.json() as {
    conversationId: string
    favorite: boolean
  }

  if (!conversationId) {
    return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })
  }

  if (favorite) {
    const { error } = await supabase
      .from('conversation_favorites')
      .upsert(
        { user_id: user.id, conversation_id: conversationId },
        { onConflict: 'user_id,conversation_id' },
      )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase
      .from('conversation_favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
