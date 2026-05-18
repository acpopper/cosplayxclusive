import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { checkImageContent } from '@/lib/sightengine'
import { normalizeImageInput } from '@/lib/image-normalize'

export const maxDuration = 60
export const dynamic     = 'force-dynamic'

/**
 * Pre-upload nudity check for the post creator. The form now uploads images
 * directly to Supabase Storage via signed URLs first (bypassing Vercel's
 * 4.5 MB serverless body limit), then calls this endpoint with the paths of
 * the freshly-uploaded objects in the `originals` bucket.
 *
 * Returns one entry per path in the original order:
 *   { index, flagged, categories, maxScore, scores }
 */
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

  const body = await request.json().catch(() => null) as { paths?: unknown } | null
  const paths = Array.isArray(body?.paths) ? body!.paths.filter((p): p is string => typeof p === 'string') : []

  if (paths.length === 0) {
    return NextResponse.json({ results: [] })
  }

  // All paths must belong to the calling user — the upload-url route already
  // generates paths prefixed with `<user.id>/`, but we re-check here so a
  // malicious caller can't run Sightengine on someone else's content.
  for (const p of paths) {
    if (!p.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Forbidden path' }, { status: 403 })
    }
  }

  const service = createServiceClient()

  const results = await Promise.all(
    paths.map(async (path, index) => {
      try {
        const { data: blob, error: dlErr } = await service.storage.from('originals').download(path)
        if (dlErr || !blob) {
          console.error(`[posts/precheck] download failed for ${path}:`, dlErr)
          return { index, flagged: false, categories: [], maxScore: 0, scores: {}, error: true }
        }

        const rawBuffer = Buffer.from(await blob.arrayBuffer())
        const contentType = blob.type || 'image/jpeg'
        const filename = path.split('/').pop() ?? 'image'

        const normalized = await normalizeImageInput(rawBuffer, { name: filename, type: contentType })
        const result = await checkImageContent(normalized.buffer, normalized.contentType, {
          userId: user.id,
          source: 'post_precheck',
        })

        return {
          index,
          flagged:    result.flagged,
          categories: result.categories,
          maxScore:   result.maxScore,
          scores:     result.scores,
        }
      } catch (err) {
        console.error(`[posts/precheck] check failed for ${path}:`, err)
        return { index, flagged: false, categories: [], maxScore: 0, scores: {}, error: true }
      }
    }),
  )

  return NextResponse.json({ results })
}
