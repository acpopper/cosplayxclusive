import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkImageContent } from '@/lib/sightengine'

/**
 * Pre-upload nudity check for the post creator. The form calls this with the
 * image files BEFORE doing any upload work, so we can warn the creator before
 * they spend time uploading content that will get flagged for review.
 *
 * Returns one entry per file in the original order:
 *   { index, flagged, categories, maxScore }
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

  const formData = await request.formData()
  const files = formData.getAll('files') as File[]

  if (files.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const results = await Promise.all(
    files.map(async (file, index) => {
      try {
        const buffer = Buffer.from(await file.arrayBuffer())
        const result = await checkImageContent(buffer, file.type)
        return {
          index,
          flagged:    result.flagged,
          categories: result.categories,
          maxScore:   result.maxScore,
          scores:     result.scores,
        }
      } catch {
        return { index, flagged: false, categories: [], maxScore: 0, scores: {} }
      }
    }),
  )

  return NextResponse.json({ results })
}
