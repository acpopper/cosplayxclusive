import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const RESULT_LIMIT = 5
const MIN_QUERY_LENGTH = 2

// Dynamic creator search for the home sidebar. Returns approved creators
// whose username or display name matches the query, with block relationships
// filtered out so the searcher can't surface people who have blocked them.
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] })
  }

  // Escape PostgREST ilike wildcards in the user-supplied query so a fan
  // can't broaden their search with raw % or _ characters.
  const safe = q.replace(/[\\%_]/g, (m) => `\\${m}`)
  const pattern = `%${safe}%`

  const [{ data: rows }, { data: blocksOut }, { data: blocksIn }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, banner_url, subscription_price_usd, fandom_tags')
      .eq('creator_status', 'approved')
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
      .limit(RESULT_LIMIT * 2),
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id),
    supabase.from('user_blocks').select('blocker_id').eq('blocked_id', user.id),
  ])

  const excluded = new Set<string>([user.id])
  for (const b of blocksOut ?? []) excluded.add(b.blocked_id)
  for (const b of blocksIn  ?? []) excluded.add(b.blocker_id)

  const results = (rows ?? [])
    .filter((r) => !excluded.has(r.id))
    .slice(0, RESULT_LIMIT)

  return NextResponse.json({ results })
}
