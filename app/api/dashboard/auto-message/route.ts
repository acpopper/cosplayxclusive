import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkImageContent } from '@/lib/sightengine'

const BUCKET = 'previews'
const MEDIA_PREFIX = 'chat-media'
const MAX_IMAGES = 3

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('creator_automessages')
    .select('*')
    .eq('creator_id', user.id)
    .maybeSingle()

  return NextResponse.json({ config: data ?? null })
}

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

  const formData = await request.formData()
  const type = formData.get('type') as 'new' | 'returning'  // which event to configure
  const text = (formData.get('text') as string | null) ?? ''
  const files = formData.getAll('files') as File[]
  const keepPaths = JSON.parse((formData.get('keepPaths') as string) ?? '[]') as string[]

  if (type !== 'new' && type !== 'returning') {
    return NextResponse.json({ error: 'type must be "new" or "returning"' }, { status: 400 })
  }

  const service = createServiceClient()

  // Upload new images (up to MAX_IMAGES - keepPaths.length)
  const newPaths: string[] = []
  const allowedNew = MAX_IMAGES - keepPaths.length
  const filesToUpload = files.slice(0, allowedNew)

  interface AutoMsgFlag {
    storagePath: string
    categories:  string[]
    maxScore:    number
    scores:      object
  }
  const pendingFlags: AutoMsgFlag[] = []

  for (let i = 0; i < filesToUpload.length; i++) {
    const file = filesToUpload[i]
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${MEDIA_PREFIX}/${user.id}/${type}/${Date.now()}_${i}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    // Run SightEngine check in parallel with upload
    const [, flagResult] = await Promise.allSettled([
      service.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: false })
        .then(({ error }) => { if (!error) newPaths.push(path) }),
      checkImageContent(buffer, file.type),
    ])

    if (flagResult.status === 'fulfilled' && flagResult.value.flagged) {
      pendingFlags.push({
        storagePath: path,
        categories:  flagResult.value.categories,
        maxScore:    flagResult.value.maxScore,
        scores:      flagResult.value.scores,
      })
    }
  }

  const mediaPaths = [...keepPaths, ...newPaths]

  // Upsert the config row
  const fieldPrefix = type === 'new' ? 'new_sub' : 'returning_sub'
  const { error: upsertErr } = await service
    .from('creator_automessages')
    .upsert(
      {
        creator_id: user.id,
        [`${fieldPrefix}_text`]: text.trim() || null,
        [`${fieldPrefix}_media`]: mediaPaths,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'creator_id' }
    )

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Persist SightEngine flags as best-effort audit
  if (pendingFlags.length > 0) {
    await service.from('image_content_flags').insert(
      pendingFlags.map((f) => ({
        source_type:        'auto_message',
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

  return NextResponse.json({ ok: true, mediaPaths })
}

/** DELETE — clear all auto-message config for a given type */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type } = await request.json() as { type: 'new' | 'returning' }
  const service = createServiceClient()
  const fieldPrefix = type === 'new' ? 'new_sub' : 'returning_sub'

  await service
    .from('creator_automessages')
    .upsert(
      {
        creator_id: user.id,
        [`${fieldPrefix}_text`]: null,
        [`${fieldPrefix}_media`]: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'creator_id' }
    )

  return NextResponse.json({ ok: true })
}
