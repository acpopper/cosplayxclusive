import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import sharp from 'sharp'

type RouteContext = { params: Promise<{ postId: string }> }

// ── Helper: verify the post belongs to the caller ─────────────────────────────
async function ownsPost(supabase: ReturnType<typeof createServiceClient>, userId: string, postId: string) {
  const { data } = await supabase
    .from('posts')
    .select('id, creator_id, media_paths, preview_paths')
    .eq('id', postId)
    .single()
  if (!data || data.creator_id !== userId) return null
  return data
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
// Two modes determined by Content-Type:
//   • application/json → simple field update (published toggle, or caption/access/price)
//   • multipart/form-data → full edit including new image uploads
export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { postId } = await ctx.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const post = await ownsPost(service, user.id, postId)
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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

  // ── FormData: full edit with optional new image uploads ───────────────────
  const fd = await request.formData()
  const caption = fd.get('caption') as string | null
  const accessType = fd.get('access_type') as string
  const priceRaw = fd.get('price_usd') as string | null
  const keepMedia: string[] = JSON.parse((fd.get('keepMediaPaths') as string) ?? '[]')
  const keepPreview: string[] = JSON.parse((fd.get('keepPreviewPaths') as string) ?? '[]')
  const newFiles = fd.getAll('files') as File[]

  // Upload new images (same pattern as create route)
  const newMediaPaths: string[] = []
  const newPreviewPaths: string[] = []

  for (let i = 0; i < newFiles.length; i++) {
    const file = newFiles[i]
    const ext = file.name.split('.').pop()
    const path = `${user.id}/${Date.now()}_edit_${i}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: origErr } = await service.storage
      .from('originals')
      .upload(path, buffer, { contentType: file.type, upsert: false })

    if (!origErr) newMediaPaths.push(path)

    // Blurred preview
    const previewPath = `${user.id}/${Date.now()}_edit_${i}_preview.jpg`
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
    } catch { /* skip on error */ }
  }

  const updates: Record<string, unknown> = {
    caption: caption?.trim() || null,
    access_type: accessType,
    price_usd: accessType === 'ppv' && priceRaw ? parseFloat(priceRaw) : null,
    media_paths: [...keepMedia, ...newMediaPaths],
    preview_paths: [...keepPreview, ...newPreviewPaths],
  }

  const { error } = await service.from('posts').update(updates).eq('id', postId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
