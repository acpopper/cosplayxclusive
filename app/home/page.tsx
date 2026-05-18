import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFeedPage } from '@/lib/feed'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import { FeedClient } from './feed-client'
import { RecommendedCreators, type RecommendedCreator } from './recommended-creators'
import { CreatorSearch } from './creator-search'
import type { Profile } from '@/lib/types'

// Sidebar shows 3 large cards; the feed injects 3-card strips between posts
// and rotates through the same pool. We fetch enough for a few rotations so
// users scrolling far down don't see the same trio every time.
const SIDEBAR_LIMIT = 3
const FEED_POOL     = 30
const PAGE_SIZE     = 10

async function getRecommendedCreators(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string,
): Promise<RecommendedCreator[]> {
  // Creators the viewer is already subscribed to — filtered out so suggestions
  // only show new discovery options.
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('creator_id')
    .eq('fan_id', viewerId)
    .eq('status', 'active')
  const excluded = new Set((subs ?? []).map((s) => s.creator_id))
  excluded.add(viewerId)

  // Block relationships go both ways.
  const [{ data: blocksOut }, { data: blocksIn }] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', viewerId),
    supabase.from('user_blocks').select('blocker_id').eq('blocked_id', viewerId),
  ])
  for (const b of blocksOut ?? []) excluded.add(b.blocked_id)
  for (const b of blocksIn  ?? []) excluded.add(b.blocker_id)

  const { data: pool } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, banner_url, subscription_price_usd, fandom_tags, created_at')
    .eq('creator_status', 'approved')
    .order('created_at', { ascending: false })
    .limit(FEED_POOL + SIDEBAR_LIMIT + 10) // headroom for excluded-filter losses

  return ((pool ?? []) as RecommendedCreator[]).filter((c) => !excluded.has(c.id))
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/explore')

  const [initialPosts, allRecommended] = await Promise.all([
    getFeedPage(supabase, user.id, PAGE_SIZE),
    getRecommendedCreators(supabase, user.id),
  ])

  // Sidebar gets the first slice; inline injections get the rest of the pool.
  // Falling back to the full pool when there aren't enough creators left so
  // the inline strip still has something to show.
  const sidebar = allRecommended.slice(0, SIDEBAR_LIMIT)
  const feedPool = allRecommended.length > SIDEBAR_LIMIT
    ? allRecommended.slice(SIDEBAR_LIMIT)
    : allRecommended

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      <Nav profile={profile as Profile} />

      <main className="mx-auto max-w-5xl w-full px-5 py-6 md:px-4 md:py-8 flex-1">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main feed column */}
          <div className="flex-1 min-w-0 max-w-xl mx-auto lg:mx-0">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-text-primary">Your Feed</h1>
              <p className="text-sm text-text-muted mt-0.5">Latest posts from creators you follow</p>
            </div>

            <FeedClient
              initialPosts={initialPosts}
              recommendations={feedPool}
              viewerId={user.id}
              viewerIsAdmin={profile.role === 'admin'}
            />
          </div>

          {/* Discovery sidebar — desktop only. Mobile uses the navbar search icon
              + the inline suggestion strips in the feed itself. */}
          <div className="hidden lg:block lg:w-72 lg:flex-shrink-0">
            <div className="lg:sticky lg:top-20 flex flex-col gap-6">
              <CreatorSearch />
              {sidebar.length > 0 && (
                <RecommendedCreators creators={sidebar} />
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
