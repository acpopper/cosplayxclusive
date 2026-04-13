import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewPostForm } from './form'

export default async function NewPostPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, creator_status')
    .eq('id', user.id)
    .single()

  if (!profile || profile.creator_status !== 'approved') {
    redirect('/dashboard')
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-text-primary">Create Post</h1>
      <NewPostForm creatorId={user.id} />
    </div>
  )
}
