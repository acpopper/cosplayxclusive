import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const USERNAME_RE = /^[a-z0-9_]{3,24}$/

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { username?: string }
  const username = (body.username ?? '').trim().toLowerCase()

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: 'Username must be 3–24 characters, lowercase letters, numbers or underscores.' },
      { status: 400 },
    )
  }

  const service = createServiceClient()

  const { data: existing } = await service
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (existing && existing.id !== user.id) {
    return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 })
  }

  const { error } = await service
    .from('profiles')
    .update({ username, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, username })
}
