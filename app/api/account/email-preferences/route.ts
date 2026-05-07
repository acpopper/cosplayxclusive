import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TOGGLEABLE_CATEGORIES, EMAIL_CATEGORIES, type EmailCategory } from '@/lib/email'

const TOGGLEABLE_SET = new Set<string>(TOGGLEABLE_CATEGORIES)

function defaultsRow(): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const k of TOGGLEABLE_CATEGORIES) {
    out[k] = EMAIL_CATEGORIES[k as EmailCategory].default
  }
  return out
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: row } = await supabase
    .from('email_preferences')
    .select(TOGGLEABLE_CATEGORIES.join(', '))
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({ preferences: row ?? defaultsRow() })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as Record<string, unknown>

  const update: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(body)) {
    if (TOGGLEABLE_SET.has(key) && typeof value === 'boolean') {
      update[key] = value
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const { error } = await supabase
    .from('email_preferences')
    .upsert(
      { user_id: user.id, ...update, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
