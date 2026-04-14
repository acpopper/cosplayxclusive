import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/nav'
import type { Profile } from '@/lib/types'

function AdminBadge() {
  return (
    <svg
      className="h-3.5 w-3.5 text-accent flex-shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-label="Admin"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' })
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, participant_a, participant_b, created_at')
    .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)

  const convIds = (conversations ?? []).map((c) => c.id)

  // Fetch other participant profiles
  const otherIds = (conversations ?? []).map((c) =>
    c.participant_a === user.id ? c.participant_b : c.participant_a
  )

  const profileMap: Record<string, {
    id: string; username: string; display_name: string | null; avatar_url: string | null; role: string
  }> = {}

  if (otherIds.length > 0) {
    const { data: others } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, role')
      .in('id', otherIds)
    for (const p of others ?? []) profileMap[p.id] = p
  }

  // Fetch last message per conversation in one query — ordered newest first,
  // then deduplicate by conversation_id in JS (first hit per conv = latest message).
  const lastMessageMap: Record<string, {
    body: string
    media_paths: string[]
    sender_id: string
    created_at: string
  }> = {}

  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, body, media_paths, sender_id, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })
      .limit(convIds.length * 10) // generous upper bound — first hit per conv wins

    for (const m of msgs ?? []) {
      if (!lastMessageMap[m.conversation_id]) {
        lastMessageMap[m.conversation_id] = {
          body: m.body ?? '',
          media_paths: (m as { media_paths?: string[] }).media_paths ?? [],
          sender_id: m.sender_id,
          created_at: m.created_at,
        }
      }
    }
  }

  // Build conv list and sort by last message time (most recent first)
  const convList = (conversations ?? [])
    .map((c) => ({
      ...c,
      other: profileMap[c.participant_a === user.id ? c.participant_b : c.participant_a],
      lastMsg: lastMessageMap[c.id] ?? null,
    }))
    .sort((a, b) => {
      const tA = a.lastMsg?.created_at ?? a.created_at
      const tB = b.lastMsg?.created_at ?? b.created_at
      return tB.localeCompare(tA)
    })

  return (
    <div className="min-h-screen bg-bg-base">
      <Nav profile={viewerProfile as Profile} />

      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold text-text-primary mb-6">Messages</h1>

        {convList.length === 0 ? (
          <div className="text-center py-16 text-text-muted bg-bg-card border border-border rounded-2xl">
            <p className="text-3xl mb-3">💬</p>
            <p className="font-medium text-text-secondary">No messages yet</p>
            <p className="text-sm mt-1">Visit a creator&apos;s profile to start a conversation</p>
          </div>
        ) : (
          <div className="bg-bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            {convList.map((conv) => {
              const other = conv.other
              const initials = (other?.display_name || other?.username || '?')[0].toUpperCase()
              const lastMsg = conv.lastMsg

              // Build preview text
              let preview: string
              if (!lastMsg) {
                preview = 'No messages yet'
              } else if (!lastMsg.body && lastMsg.media_paths.length > 0) {
                preview = '[Image]'
              } else {
                preview = lastMsg.body
              }

              const isMe = lastMsg?.sender_id === user.id

              return (
                <Link
                  key={conv.id}
                  href={`/messages/${conv.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-bg-elevated transition-colors"
                >
                  {/* Avatar */}
                  <div className="h-11 w-11 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
                    {other?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={other.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                        <span className="text-sm font-bold text-white">{initials}</span>
                      </div>
                    )}
                  </div>

                  {/* Name + preview */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-semibold text-text-primary truncate">
                        {other?.display_name || other?.username || 'Unknown'}
                      </p>
                      {other?.role === 'admin' && <AdminBadge />}
                    </div>
                    <p className="text-xs text-text-muted truncate mt-0.5">
                      {isMe && <span className="text-text-muted">You: </span>}
                      {preview}
                    </p>
                  </div>

                  {/* Timestamp */}
                  {lastMsg && (
                    <span className="text-[11px] text-text-muted flex-shrink-0 self-start mt-0.5">
                      {formatTime(lastMsg.created_at)}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
