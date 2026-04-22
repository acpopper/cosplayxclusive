import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'

interface ProfileLite {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  role: string
}

interface MessageRow {
  id: string
  sender_id: string
  body: string
  media_paths: string[] | null
  created_at: string
}

export default async function FlaggedChatViewer(
  props: PageProps<'/admin/moderation/flagged/[conversationId]'>,
) {
  const { conversationId } = await props.params
  const service = createServiceClient()

  const { data: conversation } = await service
    .from('conversations')
    .select('id, participant_a, participant_b, created_at')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conversation) notFound()

  const [{ data: messages }, { data: profiles }, { data: flags }] = await Promise.all([
    service
      .from('messages')
      .select('id, sender_id, body, media_paths, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(500),
    service
      .from('profiles')
      .select('id, username, display_name, avatar_url, role')
      .in('id', [conversation.participant_a, conversation.participant_b]),
    service
      .from('flagged_messages')
      .select('message_id, matched_pattern')
      .eq('conversation_id', conversationId),
  ])

  const messageRows = (messages ?? []) as MessageRow[]
  const profileRows = (profiles ?? []) as ProfileLite[]
  const flagRows = (flags ?? []) as { message_id: string; matched_pattern: string }[]

  const profileMap = new Map<string, ProfileLite>()
  for (const p of profileRows) profileMap.set(p.id, p)

  const flagsByMessage = new Map<string, string[]>()
  for (const f of flagRows) {
    const list = flagsByMessage.get(f.message_id) ?? []
    list.push(f.matched_pattern)
    flagsByMessage.set(f.message_id, list)
  }

  return (
    <>
      <div className="mb-4">
        <Link
          href="/admin/moderation/flagged"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-secondary transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to flagged chats
        </Link>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Conversation</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {profileRows.map((p) => `@${p.username}`).join(' · ')} · {flagRows.length} flag{flagRows.length !== 1 ? 's' : ''}
          </p>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-warning/15 text-warning">
          Read-only
        </span>
      </div>

      <div className="bg-bg-card border border-border rounded-2xl p-5">
        {messageRows.length === 0 ? (
          <p className="text-center text-sm text-text-muted py-8">No messages in this conversation.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {messageRows.map((msg) => {
              const sender = profileMap.get(msg.sender_id) ?? null
              const matched = flagsByMessage.get(msg.id)
              const mediaPaths = msg.media_paths ?? []
              const timeLabel = new Date(msg.created_at).toLocaleString('en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
              })

              return (
                <div
                  key={msg.id}
                  className={[
                    'flex gap-2 rounded-xl p-2 -mx-2',
                    matched ? 'bg-error/5 border border-error/20' : '',
                  ].join(' ')}
                >
                  <div className="h-8 w-8 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0 mt-0.5">
                    {sender?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sender.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                        <span className="text-xs font-bold text-white">
                          {(sender?.display_name || sender?.username || '?')[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-text-primary">
                        {sender?.display_name || sender?.username || 'Unknown'}
                      </span>
                      <span className="text-[11px] text-text-muted">{timeLabel}</span>
                      {matched && matched.map((pat) => (
                        <code
                          key={pat}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-error/15 text-error"
                        >
                          {pat}
                        </code>
                      ))}
                    </div>

                    {mediaPaths.length > 0 && (
                      <div className={['mt-1.5', mediaPaths.length > 1 ? 'grid grid-cols-2 gap-1' : 'flex flex-col gap-1'].join(' ')}>
                        {mediaPaths.map((path, idx) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={idx}
                            src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${path}`}
                            alt=""
                            className="rounded-lg max-h-60 w-auto object-cover"
                          />
                        ))}
                      </div>
                    )}

                    {msg.body && (
                      <p className="text-sm text-text-primary mt-1 whitespace-pre-wrap break-words">
                        {msg.body}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-text-muted text-center mt-4">
        Admins can view this conversation for moderation. You cannot send messages.
      </p>
    </>
  )
}
