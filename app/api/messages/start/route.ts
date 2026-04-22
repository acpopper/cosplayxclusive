import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * POST /api/messages/start
 * Creates a conversation (if one doesn't already exist) and sends the first message.
 * A conversation is ONLY created when a message body is provided — no empty chats.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { targetId, body } = await request.json() as { targetId: string; body: string }

  if (!targetId || targetId === user.id) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  }
  if (!body?.trim()) {
    return NextResponse.json({ error: 'Message body required' }, { status: 400 })
  }

  // Verify target exists
  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', targetId)
    .single()

  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Use service client for the inserts (conversation + message) to bypass RLS edge cases
  const service = createServiceClient()

  // Block check — either direction
  const { data: blockRow } = await service
    .from('user_blocks')
    .select('blocker_id')
    .or(
      `and(blocker_id.eq.${user.id},blocked_id.eq.${targetId}),` +
      `and(blocker_id.eq.${targetId},blocked_id.eq.${user.id})`,
    )
    .limit(1)
    .maybeSingle()

  if (blockRow) {
    return NextResponse.json(
      { error: 'You cannot message this user.' },
      { status: 403 },
    )
  }

  // Normalize participant order
  const [participantA, participantB] = [user.id, targetId].sort()

  // Find or create conversation
  let conversationId: string

  const { data: existing } = await service
    .from('conversations')
    .select('id')
    .eq('participant_a', participantA)
    .eq('participant_b', participantB)
    .maybeSingle()

  if (existing) {
    conversationId = existing.id
  } else {
    const { data: created, error } = await service
      .from('conversations')
      .insert({ participant_a: participantA, participant_b: participantB })
      .select('id')
      .single()
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create conversation' }, { status: 500 })
    }
    conversationId = created.id
  }

  // Send the first message
  const { error: msgErr } = await service
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, body: body.trim() })

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  return NextResponse.json({ conversationId })
}
