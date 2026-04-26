import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { DashboardSidebar } from './sidebar'
import { EmailVerificationBanner } from '@/components/email-verification-banner'
import type { Profile } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?next=/dashboard')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Any user who has applied (pending/approved/rejected/suspended) gets dashboard access
  if (!profile || !profile.creator_status) {
    redirect('/settings')
  }

  const emailVerified = !!user.email_confirmed_at

  return (
    <div className="min-h-screen bg-bg-base">
      <Nav profile={profile as Profile} />
      <div className="mx-auto max-w-6xl px-5 py-6 md:px-4 md:py-8">
        {!emailVerified && <EmailVerificationBanner />}
        <div className="flex flex-col md:flex-row gap-6">
          <DashboardSidebar profile={profile as Profile} />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}
