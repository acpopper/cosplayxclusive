import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import sharp from 'sharp'
import { checkImageContent, type ContentFlagResult } from '@/lib/sightengine'
import { checkAndSuspendForNsfw } from '@/lib/nsfw-strikes'
import { normalizeImageInput } from '@/lib/image-normalize'
import { MIN_PPV_USD } from '@/lib/ppv-pricing'
import { getPostHogClient } from '@/lib/posthog-server'

// Sharp keeps decoded raster buffers in memory between calls by default.
// In a constrained serverless environment that piles up across the image
// loop and OOMs the function. Disable the cache and serialise sharp work so
// peak memory stays bounded.
sharp.cache(false)
sharp.concurrency(1)

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

interface PrecheckResult {
  index:      number
  flagged:    boolean
  categories: string[]
  maxScore:   number
  scores:     ContentFlagResult['scores']
}

function parsePrecheckResults(raw: string | null): Map<number, PrecheckResult> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PrecheckResult[]
    if (!Array.isArray(parsed)) return null
    const map = new Map<number, PrecheckResult>()
    for (const entry of parsed) {
      if (typeof entry?.index === 'number') map.set(entry.index, entry)
    }
    return map
  } catch {
    return null
  }
}

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

export async function POST(request: NextRequest) {
  let stage = 'auth'
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    stage = 'profile'
    const { data: profile } = await supabase
      .from('profiles')
      .select('creator_status, username, stripe_charges_enabled')
      .eq('id', user.id)
      .single()

    if (!profile || profile.creator_status !== 'approved') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Creators can draft posts before completing Stripe onboarding, but those
    // posts stay unpublished until charges are enabled.
    const canPublish = !!profile.stripe_charges_enabled

    stage = 'parse_body'
    // Body is now JSON, not multipart. Images already live in Supabase (the
    // client uploaded them via signed URL) — we just receive their paths.
    // Video thumbs are tiny so they could ride here as data URLs if needed;
    // for now thumbs are uploaded via signed URL too, alongside the video.
    const body = await request.json().catch(() => null) as {
      caption?:          string | null
      access_type?:      string
      price_usd?:        number | null
      mediaOrder?:       string[]
      imagePaths?:       string[]    // uploaded image paths in `originals/`
      videoPaths?:       string[]    // uploaded video paths in `originals/`
      videoThumbPaths?:  string[]    // uploaded thumb paths in `previews/`
      precheckResults?:  PrecheckResult[]
    } | null

    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const caption     = body.caption ?? null
    const accessType  = body.access_type ?? 'subscriber_only'
    const priceRaw    = body.price_usd ?? null
    const mediaOrder  = Array.isArray(body.mediaOrder)      ? body.mediaOrder      : []
    const imagePaths  = Array.isArray(body.imagePaths)      ? body.imagePaths      : []
    const videoPaths  = Array.isArray(body.videoPaths)      ? body.videoPaths      : []
    const videoThumbPaths = Array.isArray(body.videoThumbPaths) ? body.videoThumbPaths : []
    const precheckResults = Array.isArray(body.precheckResults)
      ? new Map<number, PrecheckResult>(
          body.precheckResults
            .filter((r): r is PrecheckResult => typeof r?.index === 'number')
            .map((r) => [r.index, r]),
        )
      : null

    if (mediaOrder.length === 0) {
      return NextResponse.json({ error: 'No media provided' }, { status: 400 })
    }

    if (accessType === 'ppv') {
      const priceNum = typeof priceRaw === 'number' ? priceRaw : parseFloat(String(priceRaw))
      if (!Number.isFinite(priceNum) || priceNum < MIN_PPV_USD) {
        return NextResponse.json(
          { error: `PPV price must be at least $${MIN_PPV_USD.toFixed(2)}` },
          { status: 400 },
        )
      }
    }

    // Confirm every path the client sent belongs to this user. The
    // upload-url route prefixes paths with `<user.id>/`; rejecting anything
    // else stops a logged-in creator from referencing somebody else's upload.
    const allPaths = [...imagePaths, ...videoPaths, ...videoThumbPaths]
    for (const p of allPaths) {
      if (typeof p !== 'string' || !p.startsWith(`${user.id}/`)) {
        return NextResponse.json({ error: 'Forbidden path' }, { status: 403 })
      }
    }

    const service = createServiceClient()
    const mediaPaths:   string[] = []
    const previewPaths: string[] = []
    const mediaTypes:   string[] = []

    interface PendingFlag {
      storagePath: string
      previewPath: string | null
      categories:  string[]
      maxScore:    number
      scores:      object
    }
    const pendingFlags: PendingFlag[] = []

    interface ModerationEntry {
      index:      number
      type:       'image' | 'video'
      scanned:    boolean
      flagged:    boolean
      categories: string[]
      max_score:  number
      scores:     ContentFlagResult['scores']
    }
    const mediaModeration: ModerationEntry[] = []

    let imageIdx = 0
    let videoIdx = 0

    for (let i = 0; i < mediaOrder.length; i++) {
      const type = mediaOrder[i]
      stage = `media_${i}_${type}`

      if (type === 'image') {
        const fileIndex = imageIdx
        const tempPath = imagePaths[imageIdx++]
        if (!tempPath) continue

        // Download the raw image the client uploaded to Supabase storage.
        const { data: blob, error: dlErr } = await service.storage.from('originals').download(tempPath)
        if (dlErr || !blob) {
          return NextResponse.json({ error: `Could not read uploaded image: ${dlErr?.message ?? 'missing'}` }, { status: 500 })
        }
        const rawBuffer = Buffer.from(await blob.arrayBuffer())
        const filename  = tempPath.split('/').pop() ?? 'image'
        const normalized = await normalizeImageInput(rawBuffer, {
          name: filename,
          type: blob.type || 'application/octet-stream',
        })

        // Reuse the precheck result if the client already screened this image
        // (it ran against the same bytes pre-upload). Otherwise call now.
        const cached = precheckResults?.get(fileIndex)
        const flagResult: ContentFlagResult = cached
          ? {
              flagged:    cached.flagged,
              categories: cached.categories,
              maxScore:   cached.maxScore,
              scores:     cached.scores,
            }
          : await checkImageContent(normalized.buffer, normalized.contentType, {
              userId: user.id,
              source: 'post_create',
            })

        const watermarked = await applyWatermark(normalized.buffer, profile.username)

        // Decide final path. If the input was already a web-friendly format,
        // overwrite the temp object so we don't leave orphans. If we had to
        // transcode (HEIC → JPEG), write to a new path with the correct
        // extension and delete the temp.
        const tempExt = (tempPath.split('.').pop() ?? '').toLowerCase()
        const needsRename = normalized.converted && tempExt !== normalized.ext
        const finalPath = needsRename
          ? tempPath.replace(/\.[^./]+$/, `.${normalized.ext}`)
          : tempPath

        const { error: upErr } = await service.storage
          .from('originals')
          .upload(finalPath, watermarked, {
            contentType: normalized.contentType,
            cacheControl: '3600',
            upsert: true,
          })
        if (upErr) {
          return NextResponse.json({ error: `Failed to write watermarked image: ${upErr.message}` }, { status: 500 })
        }

        if (needsRename) {
          await service.storage.from('originals').remove([tempPath]).catch(() => {/* best-effort */})
        }

        mediaPaths.push(finalPath)
        mediaTypes.push('image')

        // Preview (blurred public thumbnail) — same path scheme as before.
        let savedPreviewPath: string | null = null
        const previewPath = finalPath.replace(/\.[^./]+$/, '_preview.jpg')
        try {
          const previewBuffer = await makePreviewBuffer(watermarked)
          const { error: prevErr } = await service.storage
            .from('previews')
            .upload(previewPath, previewBuffer, {
              contentType:  'image/jpeg',
              cacheControl: '3600',
              upsert:        true,
            })
          if (!prevErr) {
            previewPaths.push(previewPath)
            savedPreviewPath = previewPath
          }
        } catch { /* skip */ }

        mediaModeration.push({
          index:      mediaPaths.length - 1,
          type:       'image',
          scanned:    true,
          flagged:    flagResult.flagged,
          categories: flagResult.categories,
          max_score:  flagResult.maxScore,
          scores:     flagResult.scores,
        })

        if (flagResult.flagged) {
          pendingFlags.push({
            storagePath: finalPath,
            previewPath: savedPreviewPath,
            categories:  flagResult.categories,
            maxScore:    flagResult.maxScore,
            scores:      flagResult.scores,
          })
        }

      } else if (type === 'video') {
        const videoPath = videoPaths[videoIdx]
        const thumbPath = videoThumbPaths[videoIdx]
        videoIdx++

        if (!videoPath) continue
        mediaPaths.push(videoPath)
        mediaTypes.push('video')

        mediaModeration.push({
          index:      mediaPaths.length - 1,
          type:       'video',
          scanned:    false,
          flagged:    false,
          categories: [],
          max_score:  0,
          scores:     {},
        })

        // Thumb already lives in the `previews` bucket (client uploaded it
        // via signed URL). We just resize+blur it to match the post-image
        // preview style and overwrite in place.
        if (thumbPath) {
          try {
            const { data: thumbBlob } = await service.storage.from('previews').download(thumbPath)
            if (thumbBlob) {
              const thumbBuffer = Buffer.from(await thumbBlob.arrayBuffer())
              const previewBuffer = await makePreviewBuffer(thumbBuffer)
              const { error: prevErr } = await service.storage
                .from('previews')
                .upload(thumbPath, previewBuffer, {
                  contentType:  'image/jpeg',
                  cacheControl: '3600',
                  upsert:        true,
                })
              if (!prevErr) previewPaths.push(thumbPath)
            }
          } catch { /* skip */ }
        }
      }
    }

    const postData: Record<string, unknown> = {
      creator_id:       user.id,
      caption:          caption || null,
      access_type:      accessType,
      media_paths:      mediaPaths,
      preview_paths:    previewPaths,
      media_types:      mediaTypes,
      media_moderation: mediaModeration,
      published_at:     new Date().toISOString(),
      published:        canPublish,
    }

    if (accessType === 'ppv' && priceRaw != null) {
      postData.price_usd = typeof priceRaw === 'number' ? priceRaw : parseFloat(String(priceRaw))
    }

    stage = 'db_insert'
    const { data: insertedPost, error: insertErr } = await service
      .from('posts')
      .insert(postData)
      .select('id')
      .single()
    if (insertErr || !insertedPost) {
      return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })
    }

    // ── Post-insert side effects ────────────────────────────────────────────
    stage = 'posthog'
    try {
      getPostHogClient()?.capture({
        distinctId: user.id,
        event: 'post_created',
        properties: {
          post_id:     insertedPost.id,
          access_type: accessType,
          media_count: mediaPaths.length,
          has_caption: Boolean(caption),
          price_usd:
            accessType === 'ppv' && priceRaw != null
              ? typeof priceRaw === 'number' ? priceRaw : parseFloat(String(priceRaw))
              : undefined,
        },
      })
    } catch (err) {
      console.error('[posts/create] posthog capture failed:', err)
    }

    if (pendingFlags.length > 0) {
      stage = 'flag_audit'
      try {
        await service.from('image_content_flags').insert(
          pendingFlags.map((f) => ({
            source_type:        'post',
            post_id:            insertedPost.id,
            creator_id:         user.id,
            storage_bucket:     'originals',
            storage_path:       f.storagePath,
            preview_path:       f.previewPath,
            flagged_categories: f.categories,
            max_score:          f.maxScore,
            detection_scores:   f.scores,
          })),
        )

        const highConfidence = pendingFlags.some((f) => f.maxScore >= 0.9)
        if (highConfidence) {
          await checkAndSuspendForNsfw(service, user.id)
        }
      } catch (err) {
        console.error('[posts/create] flag audit failed:', err)
      }
    }

    return NextResponse.json({
      ok:        true,
      postId:    insertedPost.id,
      published: canPublish,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[posts/create] uncaught at stage=${stage}:`, err)
    return NextResponse.json(
      { error: `Server error at ${stage}: ${message}`, stage },
      { status: 500 },
    )
  }
}
