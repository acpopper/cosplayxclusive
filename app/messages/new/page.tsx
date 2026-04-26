import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NewChatClient } from './new-chat-client'
import { NewChatPicker } from './new-chat-picker'

export default async function NewMessagePage(props: PageProps<'/messages/new'>) {
  const params = await props.searchParams
  const withId = params.with as string | undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // No target — render the user picker (search & start a new chat)
  if (!withId) {
    return <NewChatPicker currentUserId={user.id} />
  }

  // Fetch the target user
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, role')
    .eq('id', withId)
    .maybeSingle()

  if (!targetProfile) redirect('/messages/new')

  // If a conversation already exists, redirect to it directly
  const [participantA, participantB] = [user.id, withId].sort()
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('participant_a', participantA)
    .eq('participant_b', participantB)
    .maybeSingle()

  if (existing) redirect(`/messages/${existing.id}`)

  return <NewChatClient targetProfile={targetProfile} currentUserId={user.id} />
}
