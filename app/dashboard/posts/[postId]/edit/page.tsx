import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EditPostForm } from './form'

export default async function EditPostPage(props: PageProps<'/dashboard/posts/[postId]/edit'>) {
  const { postId } = await props.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('creator_status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.creator_status !== 'approved') redirect('/dashboard')

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', postId)
    .eq('creator_id', user.id) // ensure ownership
    .single()

  if (!post) notFound()

  // Build public preview URLs so the form can show existing images
  const previewUrls = (post.preview_paths ?? []).map(
    (path: string) =>
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${path}`
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Edit Post</h1>
        <p className="text-sm text-text-muted mt-0.5">Changes go live immediately after saving.</p>
      </div>
      <EditPostForm
        postId={post.id}
        initialCaption={post.caption ?? ''}
        initialAccessType={post.access_type}
        initialPrice={post.price_usd ? String(post.price_usd) : '5.99'}
        existingMediaPaths={post.media_paths ?? []}
        existingPreviewPaths={post.preview_paths ?? []}
        existingPreviewUrls={previewUrls}
      />
    </div>
  )
}
