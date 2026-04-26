import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { AdminSidebar } from '@/components/admin-sidebar'
import { getModerationCounts } from '@/lib/moderation-counts'
import type { Profile } from '@/lib/types'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/explore')

  const counts = await getModerationCounts()

  return (
    <div className="min-h-screen bg-bg-base">
      <Nav profile={profile as Profile} />
      <div className="mx-auto max-w-6xl px-5 py-6 md:px-4 md:py-8">
        <div className="flex flex-col md:flex-row gap-6">
          <AdminSidebar profile={profile as Profile} moderationCount={counts.total} />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  )
}
