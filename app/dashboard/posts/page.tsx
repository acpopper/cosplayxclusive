import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DeletePostButton } from './delete-button'

export default async function PostsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('creator_id', user.id)
    .order('published_at', { ascending: false })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Posts</h1>
        <Link href="/dashboard/posts/new">
          <Button size="md">+ New Post</Button>
        </Link>
      </div>

      {!posts || posts.length === 0 ? (
        <div className="text-center py-16 bg-bg-card border border-border rounded-2xl text-text-muted">
          <p className="text-3xl mb-3">📸</p>
          <p className="font-medium text-text-secondary">No posts yet</p>
          <p className="text-sm mt-1 mb-4">Create your first post to start earning</p>
          <Link href="/dashboard/posts/new">
            <Button size="md">Create first post</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
          <div className="divide-y divide-border">
            {posts.map((post) => (
              <div key={post.id} className="flex items-center gap-4 px-4 py-3">
                {/* Thumbnail */}
                <div className="h-12 w-12 rounded-lg overflow-hidden bg-bg-elevated flex-shrink-0">
                  {post.preview_paths?.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${post.preview_paths[0]}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-text-muted text-xs">
                      📷
                    </div>
                  )}
                </div>

                {/* Caption */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">
                    {post.caption || <span className="text-text-muted italic">No caption</span>}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {new Date(post.published_at).toLocaleDateString()} ·{' '}
                    {post.media_paths?.length || 0} image{post.media_paths?.length !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Access badge */}
                <Badge
                  variant={
                    post.access_type === 'free'
                      ? 'muted'
                      : post.access_type === 'ppv'
                      ? 'warning'
                      : 'accent'
                  }
                  className="text-xs capitalize hidden sm:flex flex-shrink-0"
                >
                  {post.access_type === 'ppv' ? `PPV $${post.price_usd}` : post.access_type.replace('_', ' ')}
                </Badge>

                {/* Delete */}
                <DeletePostButton postId={post.id} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
