import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import sharp from 'sharp'

async function makePreviewBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize({ width: 600, withoutEnlargement: true })
    .blur(20)
    .jpeg({ quality: 40 })
    .toBuffer()
}

async function applyWatermark(buffer: Buffer, username: string): Promise<Buffer> {
  const image = sharp(buffer)
  const { width = 800, height = 600 } = await image.metadata()

  const label = `cosplayxclusive.com/@${username}`
  const fontSize = Math.max(14, Math.round(width * 0.028))
  const approxTextW = Math.round(label.length * fontSize * 0.55)
  const approxTextH = Math.round(fontSize * 1.4)
  const padH = 10
  const padV = 6
  const margin = 18
  const bgW = approxTextW + padH * 2
  const bgH = approxTextH + padV * 2
  const bgX = width - bgW - margin
  const bgY = height - bgH - margin

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" rx="5" fill="rgba(0,0,0,0.55)"/>
    <text
      x="${bgX + padH}"
      y="${bgY + bgH - padV - 2}"
      font-family="Arial, Helvetica, sans-serif"
      font-size="${fontSize}"
      font-weight="bold"
      fill="white"
    >${label}</text>
  </svg>`

  return image
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .toBuffer()
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('creator_status, username')
    .eq('id', user.id)
    .single()

  if (!profile || profile.creator_status !== 'approved') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const caption = formData.get('caption') as string | null
  const accessType = formData.get('access_type') as string
  const priceRaw = formData.get('price_usd') as string | null

  // mediaOrder: JSON array like ["image","video","image"] — preserves mixed ordering
  const mediaOrder: string[] = JSON.parse((formData.get('mediaOrder') as string) ?? '[]')
  const imageFiles = formData.getAll('files') as File[]
  const videoPaths = formData.getAll('videoPaths') as string[]
  const videoThumbFiles = formData.getAll('videoThumbs') as File[]

  if (mediaOrder.length === 0) {
    return NextResponse.json({ error: 'No media provided' }, { status: 400 })
  }

  const service = createServiceClient()
  const mediaPaths: string[] = []
  const previewPaths: string[] = []
  const mediaTypes: string[] = []

  const base = Date.now()
  let imageIdx = 0
  let videoIdx = 0

  for (let i = 0; i < mediaOrder.length; i++) {
    const type = mediaOrder[i]

    if (type === 'image') {
      const file = imageFiles[imageIdx++]
      if (!file) continue
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${base}_${i}.${ext}`
      const rawBuffer = Buffer.from(await file.arrayBuffer())
      const buffer = await applyWatermark(rawBuffer, profile.username)

      const { error: origErr } = await service.storage
        .from('originals')
        .upload(path, buffer, { contentType: file.type, cacheControl: '3600', upsert: false })

      if (origErr) {
        return NextResponse.json({ error: `Failed to upload image: ${origErr.message}` }, { status: 500 })
      }
      mediaPaths.push(path)
      mediaTypes.push('image')

      const previewPath = `${user.id}/${base}_${i}_preview.jpg`
      try {
        const previewBuffer = await makePreviewBuffer(buffer)
        const { error: prevErr } = await service.storage
          .from('previews')
          .upload(previewPath, previewBuffer, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
        if (!prevErr) previewPaths.push(previewPath)
      } catch { /* skip */ }

    } else if (type === 'video') {
      const videoPath = videoPaths[videoIdx]
      const thumbFile = videoThumbFiles[videoIdx]
      videoIdx++

      if (!videoPath) continue
      mediaPaths.push(videoPath)
      mediaTypes.push('video')

      // Generate a blurred still preview from the client-captured thumbnail
      if (thumbFile) {
        const previewPath = `${user.id}/${base}_${i}_preview.jpg`
        try {
          const thumbBuffer = Buffer.from(await thumbFile.arrayBuffer())
          const previewBuffer = await makePreviewBuffer(thumbBuffer)
          const { error: prevErr } = await service.storage
            .from('previews')
            .upload(previewPath, previewBuffer, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
          if (!prevErr) previewPaths.push(previewPath)
        } catch { /* skip */ }
      }
    }
  }

  const postData: Record<string, unknown> = {
    creator_id: user.id,
    caption: caption || null,
    access_type: accessType,
    media_paths: mediaPaths,
    preview_paths: previewPaths,
    media_types: mediaTypes,
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
