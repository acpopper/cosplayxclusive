import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFeedPage } from '@/lib/feed'
import { Nav } from '@/components/nav'
import { FeedClient } from './feed-client'
import type { Profile } from '@/lib/types'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Only fans see the home feed
  if (!profile || profile.role !== 'fan') redirect('/explore')

  const initialPosts = await getFeedPage(supabase, user.id, 20)

  return (
    <div className="min-h-screen bg-bg-base">
      <Nav profile={profile as Profile} />

      <main className="mx-auto max-w-xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text-primary">Your Feed</h1>
          <p className="text-sm text-text-muted mt-0.5">Latest posts from creators you follow</p>
        </div>

        <FeedClient
          initialPosts={initialPosts}
          viewerId={user.id}
        />
      </main>
    </div>
  )
}
