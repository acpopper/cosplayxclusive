import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import { CreatorApplyForm } from './form'
import type { Profile } from '@/lib/types'

export const metadata = { title: 'Apply to Become a Creator — CosplayXclusive' }

export default async function CreatorApplyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/settings/creator-apply')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Already pending or approved — redirect to settings
  if (profile.creator_status === 'pending' || profile.creator_status === 'approved') {
    redirect('/settings')
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      <Nav profile={profile as Profile} />

      <main className="mx-auto max-w-2xl w-full px-4 py-10 flex-1">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary">Apply to become a creator</h1>
          <p className="text-sm text-text-muted mt-1">
            Tell us about yourself and your cosplay content. Our team reviews every application and will reach out via messages.
          </p>
        </div>

        <CreatorApplyForm profile={profile as Profile} isReapply={profile.creator_status === 'rejected'} />
      </main>

      <Footer />
    </div>
  )
}
