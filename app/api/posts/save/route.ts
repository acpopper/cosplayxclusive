import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const postId = new URL(request.url).searchParams.get('postId')
  if (!postId) return NextResponse.json({ error: 'Missing postId' }, { status: 400 })

  const service = createServiceClient()
  const { data } = await service
    .from('post_saves')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({ saved: !!data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId, action } = await request.json() as {
    postId: string
    action:  'save' | 'unsave'
  }
  if (!postId || (action !== 'save' && action !== 'unsave')) {
    return NextResponse.json({ error: 'Missing postId or invalid action' }, { status: 400 })
  }

  const service = createServiceClient()

  if (action === 'unsave') {
    await service
      .from('post_saves')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', user.id)
    return NextResponse.json({ ok: true })
  }

  const { error } = await service
    .from('post_saves')
    .insert({ post_id: postId, user_id: user.id })

  // 23505 is a unique-violation — already saved, treat as success
  if (error && error.code !== '23505') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
