import type { MetadataRoute } from 'next'
import { createServiceClient } from '@/lib/supabase/server'

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cosplayxclusive.com'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const service = createServiceClient()

  // Two queries instead of an inner join: a join would emit one row per post
  // and force JS-side dedup. Splitting keeps it O(creators) and clearer.
  const [{ data: postRows }, { data: creators }] = await Promise.all([
    service.from('posts').select('creator_id').eq('published', true),
    service
      .from('profiles')
      .select('id, username, updated_at')
      .eq('creator_status', 'approved'),
  ])

  const creatorsWithPosts = new Set(
    (postRows ?? []).map((p: { creator_id: string }) => p.creator_id),
  )

  const creatorEntries: MetadataRoute.Sitemap = (creators ?? [])
    .filter((c) => creatorsWithPosts.has(c.id))
    .map((c) => ({
      url:             `${SITE_URL}/${c.username}`,
      lastModified:    c.updated_at ? new Date(c.updated_at) : new Date(),
      changeFrequency: 'weekly',
      priority:        0.7,
    }))

  return [
    {
      url:             `${SITE_URL}/`,
      changeFrequency: 'weekly',
      priority:        1.0,
    },
    {
      url:             `${SITE_URL}/explore`,
      changeFrequency: 'daily',
      priority:        0.9,
    },
    ...creatorEntries,
  ]
}
