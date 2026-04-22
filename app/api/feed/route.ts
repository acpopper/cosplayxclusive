import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getFeedPage } from '@/lib/feed'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50)

  try {
    const posts = await getFeedPage(supabase, user.id, limit, cursor)
    return NextResponse.json({ posts })
  } catch (err) {
    console.error('[api/feed]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
