import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkImageContent } from '@/lib/sightengine'

const BUCKET = 'previews'
const MEDIA_PREFIX = 'chat-media'
const MAX_IMAGES = 4

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
    .select('creator_status, role')
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
  const uploadedPaths: string[] = []

  interface PendingFlag {
    storagePath: string
    categories:  string[]
    maxScore:    number
    scores:      object
  }
  const pendingFlags: PendingFlag[] = []
  const base = Date.now()

  for (const c of checks) {
    const ext = c.file.name.split('.').pop() ?? 'jpg'
    const path = `${MEDIA_PREFIX}/${user.id}/${conversationId}/${base}_${c.index}.${ext}`
    const { error: upErr } = await service.storage
      .from(BUCKET)
      .upload(path, c.buffer, { contentType: c.file.type, upsert: false })
    if (upErr) {
      return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
    }
    uploadedPaths.push(path)

    if (c.result.flagged) {
      pendingFlags.push({
        storagePath: path,
        categories:  c.result.categories,
        maxScore:    c.result.maxScore,
        scores:      c.result.scores,
      })
    }
  }

  // Insert the message via service role so the body check (which needs the
  // updated migration) can pass even when body is empty.
  const { error: msgErr } = await service.from('messages').insert({
    conversation_id: conversationId,
    sender_id:       user.id,
    body,
    media_paths:     uploadedPaths,
    reply_to_id:     replyToId,
  })

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  if (pendingFlags.length > 0) {
    await service.from('image_content_flags').insert(
      pendingFlags.map((f) => ({
        source_type:        'message',
        post_id:            null,
        creator_id:         user.id,
        storage_bucket:     BUCKET,
        storage_path:       f.storagePath,
        preview_path:       null,
        flagged_categories: f.categories,
        max_score:          f.maxScore,
        detection_scores:   f.scores,
      })),
    )
  }

  return NextResponse.json({ ok: true, mediaPaths: uploadedPaths })
}
