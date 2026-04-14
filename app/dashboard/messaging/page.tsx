import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AutoMessageForm } from './auto-message-form'

export default async function MessagingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: config } = await supabase
    .from('creator_automessages')
    .select('*')
    .eq('creator_id', user.id)
    .maybeSingle()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Messaging</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Configure automatic messages sent to fans when they subscribe
        </p>
      </div>

      {/* Link to inbox */}
      <Link
        href="/messages"
        className="flex items-center justify-between px-4 py-3 bg-bg-card border border-border rounded-2xl hover:border-accent/30 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">💬</span>
          <div>
            <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
              Messages inbox
            </p>
            <p className="text-xs text-text-muted">View all your conversations</p>
          </div>
        </div>
        <svg className="h-4 w-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Auto-message panels */}
      <div>
        <h2 className="text-sm font-semibold text-text-secondary mb-3">
          ✨ Auto-messages
        </h2>
        <p className="text-xs text-text-muted mb-4 leading-relaxed">
          These messages are sent automatically to a fan&apos;s inbox the moment they subscribe.
          You can include optional text and up to 3 images per event. Leave both empty to disable.
        </p>

        <AutoMessageForm config={config ?? null} />
      </div>
    </div>
  )
}
