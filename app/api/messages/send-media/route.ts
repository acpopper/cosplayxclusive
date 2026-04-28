import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkImageContent } from '@/lib/sightengine'

const BUCKET_PREVIEW = 'previews'
const BUCKET_ORIGINAL = 'originals'
const MEDIA_PREFIX = 'chat-media'
const MAX_IMAGES = 4

async function makeBlurredPreview(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize({ width: 600, withoutEnlargement: true })
    .blur(20)
    .jpeg({ quality: 40 })
    .toBuffer()
}

async function applyWatermark(buffer: Buffer, username: string): Promise<Buffer> {
  const image = sharp(buffer)
  const { width = 800, height = 600 } = await image.metadata()
  const label       = `cosplayxclusive.com/@${username}`
  const fontSize    = Math.max(14, Math.round(width * 0.028))
  const approxTextW = Math.round(label.length * fontSize * 0.55)
  const approxTextH = Math.round(fontSize * 1.4)
  const padH = 10, padV = 6, margin = 18
  const bgW = approxTextW + padH * 2
  const bgH = approxTextH + padV * 2
  const bgX = width  - bgW - margin
  const bgY = height - bgH - margin

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${bgX}" y="${bgY}" width="${bgW}" height="${bgH}" rx="5" fill="rgba(0,0,0,0.55)"/>
    <text x="${bgX + padH}" y="${bgY + bgH - padV - 2}"
      font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white">${label}</text>
  </svg>`

  return image.composite([{ input: Buffer.from(svg), blend: 'over' }]).toBuffer()
}

/**
 * Sends a chat message with image attachments. Restricted to approved
 * creators. Runs Sightengine on each image; if anything is flagged at upload
 * threshold the request is rejected with 422 and a list of hits, unless the
 * caller already confirmed via `confirmFlagged=true`.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('creator_status, role, username')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.creator_status !== 'approved' && profile.role !== 'admin')) {
    return NextResponse.json({ error: 'Only approved creators can send media' }, { status: 403 })
  }

  const formData = await request.formData()
  const conversationId = formData.get('conversationId') as string | null
  const body = ((formData.get('body') as string | null) ?? '').trim()
  const confirmFlagged = formData.get('confirmFlagged') === 'true'
  const replyToIdRaw = formData.get('replyToId') as string | null
  const replyToId = replyToIdRaw && /^[0-9a-f-]{36}$/i.test(replyToIdRaw) ? replyToIdRaw : null
  const files = formData.getAll('files') as File[]

  // PPV pricing — optional, creator-set. Empty/0 means free media.
  const priceRaw = (formData.get('price_usd') as string | null)?.trim() ?? ''
  const priceParsed = priceRaw ? parseFloat(priceRaw) : 0
  const priceUsd = Number.isFinite(priceParsed) && priceParsed >= 1 ? priceParsed : 0
  const isPpv = priceUsd >= 1

  if (!conversationId) {
    return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })
  }
  if (files.length === 0) {
    return NextResponse.json({ error: 'No images provided' }, { status: 400 })
  }
  if (files.length > MAX_IMAGES) {
    return NextResponse.json({ error: `Max ${MAX_IMAGES} images per message` }, { status: 400 })
  }
  for (const f of files) {
    if (!f.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only images are supported' }, { status: 400 })
    }
  }

  // Confirm the sender is actually a participant of this conversation. RLS
  // would block the insert too, but we want a clear error before uploading.
  const { data: conv } = await supabase
    .from('conversations')
    .select('id, participant_a, participant_b')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conv || (conv.participant_a !== user.id && conv.participant_b !== user.id)) {
    return NextResponse.json({ error: 'Not a participant of this conversation' }, { status: 403 })
  }

  // Run Sightengine on every image up front (parallel with reading buffers).
  const checks = await Promise.all(
    files.map(async (file, index) => {
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await checkImageContent(buffer, file.type)
      return { index, file, buffer, result }
    }),
  )

  if (!confirmFlagged) {
    const hits = checks
      .filter((c) => c.result.flagged)
      .map((c) => ({
        index:      c.index,
        categories: c.result.categories,
        maxScore:   c.result.maxScore,
      }))
    if (hits.length > 0) {
      return NextResponse.json({ flagged: true, hits }, { status: 422 })
    }
  }

  const service = createServiceClient()
  const previewPaths:  string[] = []
  const originalPaths: string[] = []

  interface PendingFlag {
    storageBucket: string
    storagePath:   string
    previewPath:   string | null
    categories:    string[]
    maxScore:      number
    scores:        object
  }
  const pendingFlags: PendingFlag[] = []
  const base = Date.now()

  for (const c of checks) {
    const ext = c.file.name.split('.').pop() ?? 'jpg'
    const slot = `${MEDIA_PREFIX}/${user.id}/${conversationId}/${base}_${c.index}`
    const previewPath  = `${slot}_preview.jpg`
    const originalPath = `${slot}.${ext}`

    if (isPpv) {
      // Dual upload: blurred preview in public bucket + watermarked original in private bucket.
      const watermarked = await applyWatermark(c.buffer, profile.username)
      const blurred     = await makeBlurredPreview(c.buffer)

      const [origUp, prevUp] = await Promise.all([
        service.storage.from(BUCKET_ORIGINAL).upload(originalPath, watermarked, { contentType: c.file.type, upsert: false }),
        service.storage.from(BUCKET_PREVIEW) .upload(previewPath,  blurred,     { contentType: 'image/jpeg', upsert: false }),
      ])
      if (origUp.error || prevUp.error) {
        return NextResponse.json({ error: `Upload failed: ${origUp.error?.message ?? prevUp.error?.message}` }, { status: 500 })
      }
      originalPaths.push(originalPath)
      previewPaths.push(previewPath)

      if (c.result.flagged) {
        pendingFlags.push({
          storageBucket: BUCKET_ORIGINAL,
          storagePath:   originalPath,
          previewPath,
          categories:    c.result.categories,
          maxScore:      c.result.maxScore,
          scores:        c.result.scores,
        })
      }
    } else {
      // Free chat media — keep the legacy single-bucket flow (public previews).
      const { error: upErr } = await service.storage
        .from(BUCKET_PREVIEW)
        .upload(originalPath, c.buffer, { contentType: c.file.type, upsert: false })
      if (upErr) {
        return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
      }
      previewPaths.push(originalPath)

      if (c.result.flagged) {
        pendingFlags.push({
          storageBucket: BUCKET_PREVIEW,
          storagePath:   originalPath,
          previewPath:   null,
          categories:    c.result.categories,
          maxScore:      c.result.maxScore,
          scores:        c.result.scores,
        })
      }
    }
  }

  // Insert the message via service role so the body check (which needs the
  // updated migration) can pass even when body is empty.
  const { data: inserted, error: msgErr } = await service
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id:       user.id,
      body,
      media_paths:     previewPaths,
      media_originals: isPpv ? originalPaths : null,
      price_usd:       isPpv ? priceUsd : null,
      reply_to_id:     replyToId,
    })
    .select('id')
    .single()

  if (msgErr || !inserted) {
    return NextResponse.json({ error: msgErr?.message ?? 'Insert failed' }, { status: 500 })
  }

  if (pendingFlags.length > 0) {
    await service.from('image_content_flags').insert(
      pendingFlags.map((f) => ({
        source_type:        'message',
        post_id:            null,
        creator_id:         user.id,
        storage_bucket:     f.storageBucket,
        storage_path:       f.storagePath,
        preview_path:       f.previewPath,
        flagged_categories: f.categories,
        max_score:          f.maxScore,
        detection_scores:   f.scores,
      })),
    )
  }

  return NextResponse.json({
    ok:        true,
    messageId: inserted.id,
    mediaPaths: previewPaths,
    priceUsd:  isPpv ? priceUsd : null,
  })
}
