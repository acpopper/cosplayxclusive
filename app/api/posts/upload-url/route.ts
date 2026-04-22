import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('creator_status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.creator_status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { filename, contentType } = await request.json() as { filename: string; contentType: string }
  const ext = String(filename).split('.').pop()?.toLowerCase() ?? 'mp4'
  const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const service = createServiceClient()
  const { data, error } = await service.storage
    .from('originals')
    .createSignedUploadUrl(path)

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create upload URL' }, { status: 500 })
  }

  return NextResponse.json({ path, signedUrl: data.signedUrl, token: data.token })
}
