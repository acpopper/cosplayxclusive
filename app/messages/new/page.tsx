import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { NewChatClient } from './new-chat-client'
import type { Profile } from '@/lib/types'

export default async function NewMessagePage(props: PageProps<'/messages/new'>) {
  const { searchParams } = props
  const params = await searchParams
  const withId = params.with as string | undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!withId) redirect('/messages')

  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Fetch the target user
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, role')
    .eq('id', withId)
    .maybeSingle()

  if (!targetProfile) redirect('/messages')

  // If a conversation already exists, redirect to it directly
  const [participantA, participantB] = [user.id, withId].sort()
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('participant_a', participantA)
    .eq('participant_b', participantB)
    .maybeSingle()

  if (existing) redirect(`/messages/${existing.id}`)

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      <Nav profile={viewerProfile as Profile} />

      <div className="mx-auto w-full max-w-2xl px-4 pt-4">
        <Link
          href="/messages"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Messages
        </Link>
      </div>

      <NewChatClient
        targetProfile={targetProfile}
        currentUserId={user.id}
      />
    </div>
  )
}
