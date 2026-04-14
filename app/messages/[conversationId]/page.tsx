import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import { ChatClient } from './chat-client'
import type { Profile } from '@/lib/types'

export default async function ChatPage(props: PageProps<'/messages/[conversationId]'>) {
  const { conversationId } = await props.params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Verify conversation exists and viewer is a participant (RLS enforces this)
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, participant_a, participant_b')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conversation) notFound()

  const otherParticipantId =
    conversation.participant_a === user.id
      ? conversation.participant_b
      : conversation.participant_a

  // Fetch messages
  const { data: rawMessages } = await supabase
    .from('messages')
    .select('id, sender_id, body, media_paths, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200)

  // Fetch other participant profile
  const { data: otherProfile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, role')
    .eq('id', otherParticipantId)
    .single()

  // Resolve sender profiles for each message
  const profileMap: Record<string, typeof otherProfile> = {
    [user.id]: {
      id: viewerProfile!.id,
      username: viewerProfile!.username,
      display_name: viewerProfile!.display_name,
      avatar_url: viewerProfile!.avatar_url,
      role: viewerProfile!.role,
    },
  }
  if (otherProfile) profileMap[otherProfile.id] = otherProfile

  const messages = (rawMessages || []).map((msg) => ({
    ...msg,
    media_paths: (msg as { media_paths?: string[] }).media_paths ?? [],
    sender: profileMap[msg.sender_id] ?? null,
  }))

  const currentUserProfile = {
    id: viewerProfile!.id,
    username: viewerProfile!.username,
    display_name: viewerProfile!.display_name,
    avatar_url: viewerProfile!.avatar_url,
    role: viewerProfile!.role,
  }

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      <Nav profile={viewerProfile as Profile} />

      {/* Back link */}
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

      <ChatClient
        conversationId={conversationId}
        initialMessages={messages}
        currentUserProfile={currentUserProfile}
        otherProfile={otherProfile ?? null}
      />
    </div>
  )
}
