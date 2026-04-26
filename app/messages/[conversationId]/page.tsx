import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatClient } from './chat-client'

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
    .select('id, sender_id, body, media_paths, reply_to_id, created_at')
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

  type RawMessage = {
    id: string
    sender_id: string
    body: string
    media_paths: string[] | null
    reply_to_id: string | null
    created_at: string
  }
  const rawList = (rawMessages ?? []) as RawMessage[]
  const messageIds = rawList.map((m) => m.id)

  // Resolve quoted reply targets — may include older messages outside the 200-row window.
  const replyTargetIds = Array.from(
    new Set(rawList.map((m) => m.reply_to_id).filter((v): v is string => Boolean(v))),
  )
  const knownIdSet = new Set(messageIds)
  const missingTargetIds = replyTargetIds.filter((id) => !knownIdSet.has(id))

  type ReplyRow = { id: string; sender_id: string; body: string; media_paths: string[] | null }
  const replyTargetMap = new Map<string, ReplyRow>()
  for (const m of rawList) {
    if (replyTargetIds.includes(m.id)) {
      replyTargetMap.set(m.id, { id: m.id, sender_id: m.sender_id, body: m.body, media_paths: m.media_paths })
    }
  }
  if (missingTargetIds.length > 0) {
    const { data: extra } = await supabase
      .from('messages')
      .select('id, sender_id, body, media_paths')
      .in('id', missingTargetIds)
    for (const r of (extra ?? []) as ReplyRow[]) replyTargetMap.set(r.id, r)
  }

  // Likes — count per message + which ones the viewer liked.
  type LikeRow = { message_id: string; user_id: string }
  const { data: likes } = messageIds.length > 0
    ? await supabase.from('message_likes').select('message_id, user_id').in('message_id', messageIds)
    : { data: [] as LikeRow[] }

  const likeCountMap = new Map<string, number>()
  const myLikedSet = new Set<string>()
  for (const l of (likes ?? []) as LikeRow[]) {
    likeCountMap.set(l.message_id, (likeCountMap.get(l.message_id) ?? 0) + 1)
    if (l.user_id === user.id) myLikedSet.add(l.message_id)
  }

  const messages = rawList.map((msg) => {
    let reply_to: {
      id: string
      sender_username: string
      sender_display_name: string | null
      body: string
      has_media: boolean
    } | null = null
    if (msg.reply_to_id) {
      const target = replyTargetMap.get(msg.reply_to_id)
      const targetSender = target ? profileMap[target.sender_id] : null
      if (target && targetSender) {
        reply_to = {
          id:                  target.id,
          sender_username:     targetSender.username,
          sender_display_name: targetSender.display_name,
          body:                target.body,
          has_media:           (target.media_paths?.length ?? 0) > 0,
        }
      }
    }
    return {
      id:           msg.id,
      sender_id:    msg.sender_id,
      body:         msg.body,
      media_paths:  msg.media_paths ?? [],
      reply_to_id:  msg.reply_to_id,
      created_at:   msg.created_at,
      sender:       profileMap[msg.sender_id] ?? null,
      reply_to,
      like_count:   likeCountMap.get(msg.id) ?? 0,
      has_liked:    myLikedSet.has(msg.id),
    }
  })

  const currentUserProfile = {
    id: viewerProfile!.id,
    username: viewerProfile!.username,
    display_name: viewerProfile!.display_name,
    avatar_url: viewerProfile!.avatar_url,
    role: viewerProfile!.role,
  }

  const canSendMedia =
    viewerProfile!.creator_status === 'approved' || viewerProfile!.role === 'admin'

  const { data: favoriteRow } = await supabase
    .from('conversation_favorites')
    .select('conversation_id')
    .eq('user_id', user.id)
    .eq('conversation_id', conversationId)
    .maybeSingle()

  return (
    <ChatClient
      conversationId={conversationId}
      initialMessages={messages}
      currentUserProfile={currentUserProfile}
      otherProfile={otherProfile ?? null}
      canSendMedia={canSendMedia}
      initialFavorite={!!favoriteRow}
    />
  )
}
