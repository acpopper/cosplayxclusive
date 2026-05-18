import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewPostForm } from './form'

export default async function NewPostPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, creator_status, stripe_charges_enabled')
    .eq('id', user.id)
    .single()

  if (!profile || profile.creator_status !== 'approved') {
    redirect('/dashboard')
  }

  const stripeReady = !!profile.stripe_charges_enabled

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-text-primary">Create Post</h1>

      {!stripeReady && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-4 flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-warning">Heads up — your posts will be saved as drafts</p>
            <p className="text-xs text-text-muted mt-1">
              You haven&apos;t finished connecting Stripe yet, so this post will be unpublished until you do.
              Once Stripe is set up, you can publish any draft from your posts list.
            </p>
            <Link
              href="/dashboard/connect"
              className="inline-block mt-2 text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
            >
              Connect Stripe →
            </Link>
          </div>
        </div>
      )}

      <NewPostForm creatorId={user.id} />
    </div>
  )
}
