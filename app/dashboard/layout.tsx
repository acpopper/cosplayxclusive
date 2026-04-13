import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { DashboardSidebar } from './sidebar'
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

  if (!profile || profile.role !== 'creator') {
    redirect('/explore')
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <Nav profile={profile as Profile} />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col md:flex-row gap-6">
          <DashboardSidebar profile={profile as Profile} />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}
