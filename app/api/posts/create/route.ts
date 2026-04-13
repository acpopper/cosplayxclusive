import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify caller is an approved creator
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, creator_status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'creator' || profile.creator_status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const caption = formData.get('caption') as string | null
  const accessType = formData.get('access_type') as string
  const priceRaw = formData.get('price_usd') as string | null
  const files = formData.getAll('files') as File[]

  if (!files.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }

  const service = createServiceClient()
  const mediaPaths: string[] = []
  const previewPaths: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const ext = file.name.split('.').pop()
    const path = `${user.id}/${Date.now()}_${i}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: origErr } = await service.storage
      .from('originals')
      .upload(path, buffer, { contentType: file.type, cacheControl: '3600', upsert: false })

    if (origErr) {
      return NextResponse.json({ error: `Failed to upload image: ${origErr.message}` }, { status: 500 })
    }
    mediaPaths.push(path)

    const { error: prevErr } = await service.storage
      .from('previews')
      .upload(path, buffer, { contentType: file.type, cacheControl: '3600', upsert: false })

    if (!prevErr) previewPaths.push(path)
  }

  const postData: Record<string, unknown> = {
    creator_id: user.id,
    caption: caption || null,
    access_type: accessType,
    media_paths: mediaPaths,
    preview_paths: previewPaths,
    published_at: new Date().toISOString(),
  }

  if (accessType === 'ppv' && priceRaw) {
    postData.price_usd = parseFloat(priceRaw)
  }

  const { error: insertErr } = await service.from('posts').insert(postData)
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
