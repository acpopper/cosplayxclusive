import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getSavedPosts } from '@/lib/saved-posts'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import { FeedPostCard } from '@/app/home/feed-post-card'
import type { Profile } from '@/lib/types'

export const metadata: Metadata = {
  title: 'Collections',
  robots: { index: false },
}

export default async function CollectionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/collections')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/explore')

  const posts = await getSavedPosts(supabase, user.id)
  const isAdmin = (profile as Profile).role === 'admin'

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      <Nav profile={profile as Profile} />

      <main className="mx-auto max-w-xl w-full px-5 py-6 md:px-4 md:py-8 flex-1">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text-primary">Collections</h1>
          <p className="text-sm text-text-muted mt-0.5">Posts you&apos;ve bookmarked</p>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-20 text-text-muted">
            <svg className="h-12 w-12 mx-auto mb-3 text-text-muted" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <p className="text-lg font-medium text-text-secondary">No saved posts yet</p>
            <p className="text-sm mt-2">
              Tap the bookmark icon on any post to save it here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {posts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                viewerId={user.id}
                viewerIsAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}
