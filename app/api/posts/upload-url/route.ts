import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const ALLOWED_BUCKETS = new Set(['originals', 'previews'])

// Issues a one-shot signed upload URL for a path owned by the calling user.
// Used by the new-post / edit forms to push images, videos, and video
// thumbnails directly to Supabase storage — bypassing Vercel's 4.5 MB
// serverless body limit on multipart uploads.
//
// Request body: { filename, contentType, bucket? }
//   - `bucket` defaults to 'originals'. Anything other than the allowlist is
//     rejected. Posts use 'originals' for the raw upload; video thumbs go to
//     'previews' since they're public.
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

  const body = await request.json().catch(() => null) as
    | { filename?: string; contentType?: string; bucket?: string }
    | null
  if (!body || typeof body.filename !== 'string') {
    return NextResponse.json({ error: 'Missing filename' }, { status: 400 })
  }

  const bucket = typeof body.bucket === 'string' ? body.bucket : 'originals'
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 })
  }

  const ext = String(body.filename).split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const service = createServiceClient()
  const { data, error } = await service.storage
    .from(bucket)
    .createSignedUploadUrl(path)

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create upload URL' }, { status: 500 })
  }

  return NextResponse.json({ path, bucket, signedUrl: data.signedUrl, token: data.token })
}
