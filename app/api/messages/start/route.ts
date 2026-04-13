import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { targetId } = await request.json()

  if (!targetId || targetId === user.id) {
    return NextResponse.json({ error: 'Invalid target' }, { status: 400 })
  }

  // Verify target user exists
  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', targetId)
    .single()

  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Normalize participant order (lexicographic) to keep UNIQUE constraint happy
  const [participantA, participantB] = [user.id, targetId].sort()

  // Check if conversation already exists
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('participant_a', participantA)
    .eq('participant_b', participantB)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ conversationId: existing.id })
  }

  // Create new conversation
  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ participant_a: participantA, participant_b: participantB })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ conversationId: created.id })
}
