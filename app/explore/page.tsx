import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { CreatorsFilter } from './creators-filter'
import type { Profile } from '@/lib/types'

export default async function ExplorePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  let viewerProfile: Profile | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    viewerProfile = data
  }

  const { data: creators } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url, subscription_price_usd, fandom_tags, created_at')
    .eq('role', 'creator')
    .eq('creator_status', 'approved')

  return (
    <div className="min-h-screen bg-bg-base">
      <Nav profile={viewerProfile} />

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary">Discover Creators</h1>
          <p className="mt-1 text-text-secondary text-sm">
            Premium cosplay content from talented creators
          </p>
        </div>

        {!creators || creators.length === 0 ? (
          <div className="text-center py-24 text-text-muted">
            <p className="text-5xl mb-4">✦</p>
            <p className="text-lg font-medium text-text-secondary">No creators yet</p>
            <p className="text-sm mt-2">Be the first to join as a creator!</p>
          </div>
        ) : (
          <CreatorsFilter creators={creators} />
        )}
      </main>
    </div>
  )
}
