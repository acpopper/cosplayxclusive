import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import sharp from 'sharp'

type RouteContext = { params: Promise<{ postId: string }> }

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

async function ownsPost(supabase: ReturnType<typeof createServiceClient>, userId: string, postId: string) {
  const { data } = await supabase
    .from('posts')
    .select('id, creator_id, media_paths, preview_paths, media_types')
    .eq('id', postId)
    .single()
  if (!data || data.creator_id !== userId) return null
  return data
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { postId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const post = await ownsPost(service, user.id, postId)
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  const username = profile?.username ?? 'creator'

  const ct = request.headers.get('content-type') ?? ''

  // ── JSON: simple field update ──────────────────────────────────────────────
  if (!ct.includes('multipart/form-data')) {
    const body = await request.json() as {
      published?: boolean
      caption?: string
      access_type?: string
      price_usd?: number | null
    }

    const updates: Record<string, unknown> = {}
    if (typeof body.published === 'boolean') updates.published = body.published
    if ('caption' in body) updates.caption = body.caption ?? null
    if ('access_type' in body) updates.access_type = body.access_type
    if ('price_usd' in body) updates.price_usd = body.price_usd

    const { error } = await service.from('posts').update(updates).eq('id', postId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── FormData: full edit with optional new media uploads ───────────────────
  const fd = await request.formData()
  const caption = fd.get('caption') as string | null
  const accessType = fd.get('access_type') as string
  const priceRaw = fd.get('price_usd') as string | null

  const keepMedia: string[] = JSON.parse((fd.get('keepMediaPaths') as string) ?? '[]')
  const keepPreview: string[] = JSON.parse((fd.get('keepPreviewPaths') as string) ?? '[]')
  const keepTypes: string[] = JSON.parse((fd.get('keepMediaTypes') as string) ?? '[]')

  // New items in the same mixed format as the create route
  const newMediaOrder: string[] = JSON.parse((fd.get('mediaOrder') as string) ?? '[]')
  const newImageFiles = fd.getAll('files') as File[]
  const newVideoPaths = fd.getAll('videoPaths') as string[]
  const newVideoThumbFiles = fd.getAll('videoThumbs') as File[]

  const newMediaPaths: string[] = []
  const newPreviewPaths: string[] = []
  const newMediaTypes: string[] = []

  const base = Date.now()
  let imageIdx = 0
  let videoIdx = 0

  for (let i = 0; i < newMediaOrder.length; i++) {
    const type = newMediaOrder[i]

    if (type === 'image') {
      const file = newImageFiles[imageIdx++]
      if (!file) continue
      const ext = file.name.split('.').pop()
      const path = `${user.id}/${base}_edit_${i}.${ext}`
      const rawBuffer = Buffer.from(await file.arrayBuffer())
      const buffer = await applyWatermark(rawBuffer, username)

      const { error: origErr } = await service.storage
        .from('originals')
        .upload(path, buffer, { contentType: file.type, upsert: false })

      if (!origErr) {
        newMediaPaths.push(path)
        newMediaTypes.push('image')
      }

      const previewPath = `${user.id}/${base}_edit_${i}_preview.jpg`
      try {
        const previewBuffer = await sharp(buffer)
          .resize({ width: 600, withoutEnlargement: true })
          .blur(20)
          .jpeg({ quality: 40 })
          .toBuffer()
        const { error: prevErr } = await service.storage
          .from('previews')
          .upload(previewPath, previewBuffer, { contentType: 'image/jpeg', upsert: false })
        if (!prevErr) newPreviewPaths.push(previewPath)
      } catch { /* skip */ }

    } else if (type === 'video') {
      const videoPath = newVideoPaths[videoIdx]
      const thumbFile = newVideoThumbFiles[videoIdx]
      videoIdx++

      if (!videoPath) continue
      newMediaPaths.push(videoPath)
      newMediaTypes.push('video')

      if (thumbFile) {
        const previewPath = `${user.id}/${base}_edit_${i}_preview.jpg`
        try {
          const thumbBuffer = Buffer.from(await thumbFile.arrayBuffer())
          const previewBuffer = await sharp(thumbBuffer)
            .resize({ width: 600, withoutEnlargement: true })
            .blur(20)
            .jpeg({ quality: 40 })
            .toBuffer()
          const { error: prevErr } = await service.storage
            .from('previews')
            .upload(previewPath, previewBuffer, { contentType: 'image/jpeg', upsert: false })
          if (!prevErr) newPreviewPaths.push(previewPath)
        } catch { /* skip */ }
      }
    }
  }

  // Normalise kept types (legacy posts won't have media_types stored)
  const normalisedKeepTypes = keepMedia.map((_, i) => keepTypes[i] ?? 'image')

  const updates: Record<string, unknown> = {
    caption: caption?.trim() || null,
    access_type: accessType,
    price_usd: accessType === 'ppv' && priceRaw ? parseFloat(priceRaw) : null,
    media_paths: [...keepMedia, ...newMediaPaths],
    preview_paths: [...keepPreview, ...newPreviewPaths],
    media_types: [...normalisedKeepTypes, ...newMediaTypes],
  }

  const { error } = await service.from('posts').update(updates).eq('id', postId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
