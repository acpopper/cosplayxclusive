import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import sharp from 'sharp'
import { normalizeImageInput } from '@/lib/image-normalize'
import { MIN_PPV_USD } from '@/lib/ppv-pricing'

sharp.cache(false)
sharp.concurrency(1)

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

type RouteContext = { params: Promise<{ postId: string }> }

async function applyWatermark(buffer: Buffer, username: string): Promise<Buffer> {
  const image = sharp(buffer)
  const { width = 800, height = 600 } = await image.metadata()

  const label = `cosplayxclusive.com/${username}`
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

interface EditBody {
  // simple-field updates
  published?:   boolean
  caption?:     string | null
  access_type?: string
  price_usd?:   number | null

  // full media edit (presence of `mediaOrder` triggers this branch)
  mediaOrder?:      string[]
  keepMediaPaths?:  string[]
  keepPreviewPaths?: string[]
  keepMediaTypes?:  string[]
  imagePaths?:      string[]
  videoPaths?:      string[]
  videoThumbPaths?: string[]
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

  const body = await request.json().catch(() => null) as EditBody | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const isMediaEdit = Array.isArray(body.mediaOrder)

  // ── Simple field update (no media edit) ─────────────────────────────────
  if (!isMediaEdit) {
    const updates: Record<string, unknown> = {}
    if (typeof body.published === 'boolean') updates.published = body.published
    if ('caption' in body) updates.caption = body.caption ?? null
    if ('access_type' in body) updates.access_type = body.access_type
    if ('price_usd' in body) {
      if (
        body.access_type === 'ppv'
        && (typeof body.price_usd !== 'number' || body.price_usd < MIN_PPV_USD)
      ) {
        return NextResponse.json(
          { error: `PPV price must be at least $${MIN_PPV_USD.toFixed(2)}` },
          { status: 400 },
        )
      }
      updates.price_usd = body.price_usd
    }

    const { error } = await service.from('posts').update(updates).eq('id', postId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Media edit ──────────────────────────────────────────────────────────
  const caption     = body.caption ?? null
  const accessType  = body.access_type ?? 'subscriber_only'
  const priceRaw    = body.price_usd ?? null
  const mediaOrder  = body.mediaOrder ?? []
  const keepMedia   = Array.isArray(body.keepMediaPaths)   ? body.keepMediaPaths   : []
  const keepPreview = Array.isArray(body.keepPreviewPaths) ? body.keepPreviewPaths : []
  const keepTypes   = Array.isArray(body.keepMediaTypes)   ? body.keepMediaTypes   : []
  const imagePaths  = Array.isArray(body.imagePaths)       ? body.imagePaths       : []
  const videoPaths  = Array.isArray(body.videoPaths)       ? body.videoPaths       : []
  const videoThumbPaths = Array.isArray(body.videoThumbPaths) ? body.videoThumbPaths : []

  if (accessType === 'ppv') {
    const priceNum = typeof priceRaw === 'number' ? priceRaw : parseFloat(String(priceRaw))
    if (!Number.isFinite(priceNum) || priceNum < MIN_PPV_USD) {
      return NextResponse.json(
        { error: `PPV price must be at least $${MIN_PPV_USD.toFixed(2)}` },
        { status: 400 },
      )
    }
  }

  // Path ownership check — every uploaded path must start with the user id.
  for (const p of [...imagePaths, ...videoPaths, ...videoThumbPaths]) {
    if (typeof p !== 'string' || !p.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Forbidden path' }, { status: 403 })
    }
  }

  const newMediaPaths:   string[] = []
  const newPreviewPaths: string[] = []
  const newMediaTypes:   string[] = []

  let imageIdx = 0
  let videoIdx = 0

  for (let i = 0; i < mediaOrder.length; i++) {
    const type = mediaOrder[i]

    if (type === 'image') {
      const tempPath = imagePaths[imageIdx++]
      if (!tempPath) continue

      const { data: blob, error: dlErr } = await service.storage.from('originals').download(tempPath)
      if (dlErr || !blob) continue
      const rawBuffer = Buffer.from(await blob.arrayBuffer())
      const filename = tempPath.split('/').pop() ?? 'image'
      const normalized = await normalizeImageInput(rawBuffer, {
        name: filename,
        type: blob.type || 'application/octet-stream',
      })

      const watermarked = await applyWatermark(normalized.buffer, username)

      const tempExt = (tempPath.split('.').pop() ?? '').toLowerCase()
      const needsRename = normalized.converted && tempExt !== normalized.ext
      const finalPath = needsRename
        ? tempPath.replace(/\.[^./]+$/, `.${normalized.ext}`)
        : tempPath

      const { error: origErr } = await service.storage
        .from('originals')
        .upload(finalPath, watermarked, {
          contentType:  normalized.contentType,
          cacheControl: '3600',
          upsert:        true,
        })

      if (!origErr) {
        newMediaPaths.push(finalPath)
        newMediaTypes.push('image')

        if (needsRename) {
          await service.storage.from('originals').remove([tempPath]).catch(() => {/* best-effort */})
        }

        const previewPath = finalPath.replace(/\.[^./]+$/, '_preview.jpg')
        try {
          const previewBuffer = await sharp(watermarked)
            .resize({ width: 600, withoutEnlargement: true })
            .blur(20)
            .jpeg({ quality: 40 })
            .toBuffer()
          const { error: prevErr } = await service.storage
            .from('previews')
            .upload(previewPath, previewBuffer, {
              contentType:  'image/jpeg',
              cacheControl: '3600',
              upsert:        true,
            })
          if (!prevErr) newPreviewPaths.push(previewPath)
        } catch { /* skip */ }
      }

    } else if (type === 'video') {
      const videoPath = videoPaths[videoIdx]
      const thumbPath = videoThumbPaths[videoIdx]
      videoIdx++

      if (!videoPath) continue
      newMediaPaths.push(videoPath)
      newMediaTypes.push('video')

      if (thumbPath) {
        try {
          const { data: thumbBlob } = await service.storage.from('previews').download(thumbPath)
          if (thumbBlob) {
            const thumbBuffer = Buffer.from(await thumbBlob.arrayBuffer())
            const previewBuffer = await sharp(thumbBuffer)
              .resize({ width: 600, withoutEnlargement: true })
              .blur(20)
              .jpeg({ quality: 40 })
              .toBuffer()
            const { error: prevErr } = await service.storage
              .from('previews')
              .upload(thumbPath, previewBuffer, {
                contentType:  'image/jpeg',
                cacheControl: '3600',
                upsert:        true,
              })
            if (!prevErr) newPreviewPaths.push(thumbPath)
          }
        } catch { /* skip */ }
      }
    }
  }

  const normalisedKeepTypes = keepMedia.map((_, i) => keepTypes[i] ?? 'image')

  const updates: Record<string, unknown> = {
    caption:       caption?.trim() || null,
    access_type:   accessType,
    price_usd:
      accessType === 'ppv' && priceRaw != null
        ? (typeof priceRaw === 'number' ? priceRaw : parseFloat(String(priceRaw)))
        : null,
    media_paths:   [...keepMedia, ...newMediaPaths],
    preview_paths: [...keepPreview, ...newPreviewPaths],
    media_types:   [...normalisedKeepTypes, ...newMediaTypes],
  }

  const { error } = await service.from('posts').update(updates).eq('id', postId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const { postId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isAdmin = profile?.role === 'admin'

  const service = createServiceClient()
  const { data: post } = await service
    .from('posts')
    .select('id, creator_id')
    .eq('id', postId)
    .single()

  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (post.creator_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await service.from('posts').delete().eq('id', postId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
