import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const body = (await request.json()) as { pattern?: string; isRegex?: boolean }
  const pattern = (body.pattern ?? '').trim()
  const isRegex = Boolean(body.isRegex)

  if (!pattern) {
    return NextResponse.json({ error: 'Pattern is required.' }, { status: 400 })
  }
  if (pattern.length > 200) {
    return NextResponse.json({ error: 'Pattern is too long (max 200 chars).' }, { status: 400 })
  }

  // Validate regex compiles before storing.
  if (isRegex) {
    try {
      new RegExp(pattern, 'i')
    } catch {
      return NextResponse.json({ error: 'Invalid regular expression.' }, { status: 400 })
    }
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('moderation_rules')
    .insert({ pattern, is_regex: isRegex, created_by: auth.userId })
    .select('id, pattern, is_regex, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}
