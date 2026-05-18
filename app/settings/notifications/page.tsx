import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { Footer } from '@/components/footer'
import {
  EMAIL_CATEGORIES,
  TOGGLEABLE_CATEGORIES,
  visibleRequiredCategories,
  visibleToggleableCategories,
  type EmailCategory,
  type EmailPreferencesRow,
} from '@/lib/email'
import { NotificationsForm } from './form'
import type { Profile } from '@/lib/types'

export const metadata: Metadata = {
  title:  'Email notifications',
  robots: { index: false },
}

export default async function NotificationsSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/settings/notifications')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  const isCreator = profile.creator_status === 'approved' || profile.role === 'admin'

  // Always select every toggleable column from the DB — that way we can hide
  // a category in the UI today and surface it later without re-fetching.
  const { data: row } = await supabase
    .from('email_preferences')
    .select(TOGGLEABLE_CATEGORIES.join(', '))
    .eq('user_id', user.id)
    .maybeSingle()

  const initial: EmailPreferencesRow = TOGGLEABLE_CATEGORIES.reduce(
    (acc, key) => {
      const stored = (row as Record<string, boolean | undefined> | null)?.[key]
      acc[key] = typeof stored === 'boolean' ? stored : EMAIL_CATEGORIES[key as EmailCategory].default
      return acc
    },
    {} as EmailPreferencesRow,
  )

  const requiredKeys    = visibleRequiredCategories({ isCreator })
  const toggleableKeys  = visibleToggleableCategories({ isCreator })

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      <Nav profile={profile as Profile} />

      <main className="mx-auto max-w-2xl w-full px-5 py-6 md:px-4 md:py-10 flex-1">
        <div className="mb-6">
          <Link href="/settings" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
            ← Back to settings
          </Link>
          <h1 className="text-2xl font-bold text-text-primary mt-2">Email notifications</h1>
          <p className="text-sm text-text-muted mt-1">
            Choose which emails CosplayXclusive sends to <span className="text-text-secondary">{user.email}</span>.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          {/* ── Always-on (transactional) ───────────────────────────── */}
          <section className="bg-bg-card border border-border rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-text-primary mb-1">Always on</h2>
            <p className="text-xs text-text-muted mb-4">
              These emails are part of using your account and can&apos;t be turned off.
            </p>
            <ul className="flex flex-col gap-3">
              {requiredKeys.map((key) => {
                const meta = EMAIL_CATEGORIES[key]
                return (
                  <li key={key} className="flex flex-col">
                    <span className="text-sm font-medium text-text-primary">{meta.label}</span>
                    <span className="text-xs text-text-muted">{meta.description}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          {/* ── User-toggleable ─────────────────────────────────────── */}
          {toggleableKeys.length > 0 ? (
            <NotificationsForm initial={initial} categoryKeys={toggleableKeys} />
          ) : (
            <section className="bg-bg-card border border-border rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-text-primary mb-1">Optional</h2>
              <p className="text-xs text-text-muted">
                You have no optional emails to configure right now. We&apos;ll only send the
                account and payment messages above.
              </p>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
