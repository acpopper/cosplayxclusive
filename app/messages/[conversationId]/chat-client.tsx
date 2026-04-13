'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SenderProfile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  role: string
}

interface MessageItem {
  id: string
  sender_id: string
  body: string
  created_at: string
  sender: SenderProfile | null
}

interface ChatClientProps {
  conversationId: string
  initialMessages: MessageItem[]
  currentUserProfile: SenderProfile
  otherProfile: SenderProfile | null
}

function AdminBadge() {
  return (
    <svg
      className="h-3.5 w-3.5 text-accent flex-shrink-0 inline-block"
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

export function ChatClient({
  conversationId,
  initialMessages,
  currentUserProfile,
  otherProfile,
}: ChatClientProps) {
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => createClient(), [])

  // Build a lookup for resolving sender profiles from realtime payloads
  const participantMap = useMemo<Record<string, SenderProfile>>(() => {
    const map: Record<string, SenderProfile> = { [currentUserProfile.id]: currentUserProfile }
    if (otherProfile) map[otherProfile.id] = otherProfile
    return map
  }, [currentUserProfile, otherProfile])

  // Mark conversation as read on mount and when new messages arrive
  const markRead = useCallback(async () => {
    await supabase
      .from('conversation_reads')
      .upsert(
        { conversation_id: conversationId, user_id: currentUserProfile.id, last_read_at: new Date().toISOString() },
        { onConflict: 'conversation_id,user_id' }
      )
  }, [supabase, conversationId, currentUserProfile.id])

  useEffect(() => { markRead() }, [markRead])

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; sender_id: string; body: string; created_at: string }
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, { ...row, sender: participantMap[row.sender_id] ?? null }]
          })
          // Keep read pointer current while chat is open
          markRead()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, supabase, participantMap, markRead])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = body.trim()
    if (!text || sending) return

    setSending(true)
    setBody('')

    await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: currentUserProfile.id, body: text })

    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col flex-1 mx-auto w-full max-w-2xl px-4 pb-6">
      {/* Other user header */}
      {otherProfile && (
        <div className="flex items-center gap-3 py-4 border-b border-border mb-2">
          <div className="h-9 w-9 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
            {otherProfile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={otherProfile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                <span className="text-sm font-bold text-white">
                  {(otherProfile.display_name || otherProfile.username)[0].toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-text-primary">
                {otherProfile.display_name || otherProfile.username}
              </span>
              {otherProfile.role === 'admin' && <AdminBadge />}
            </div>
            <p className="text-xs text-text-muted">@{otherProfile.username}</p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 flex flex-col gap-3 py-4 min-h-0 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-center text-xs text-text-muted py-8">
            No messages yet. Say hello!
          </p>
        )}

        {messages.map((msg) => {
          const isMe = msg.sender_id === currentUserProfile.id
          const sender = msg.sender ?? (isMe ? currentUserProfile : otherProfile)
          const timeLabel = new Date(msg.created_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })

          return (
            <div
              key={msg.id}
              className={['flex gap-2', isMe ? 'flex-row-reverse' : 'flex-row'].join(' ')}
            >
              {/* Avatar */}
              <div className="h-7 w-7 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0 mt-0.5">
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

              <div className={['flex flex-col max-w-[75%]', isMe ? 'items-end' : 'items-start'].join(' ')}>
                {/* Sender name + admin badge */}
                {!isMe && sender && (
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-xs font-medium text-text-secondary">
                      {sender.display_name || sender.username}
                    </span>
                    {sender.role === 'admin' && <AdminBadge />}
                  </div>
                )}

                <div
                  className={[
                    'rounded-2xl px-3 py-2 text-sm leading-relaxed',
                    isMe
                      ? 'bg-accent text-white rounded-tr-sm'
                      : 'bg-bg-elevated text-text-primary rounded-tl-sm',
                  ].join(' ')}
                >
                  {msg.body}
                </div>
                <span className="text-[11px] text-text-muted mt-0.5">{timeLabel}</span>
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t border-border">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send)"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-border bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors max-h-32"
        />
        <button
          onClick={handleSend}
          disabled={!body.trim() || sending}
          className="h-10 w-10 flex-shrink-0 self-end rounded-xl bg-accent text-white flex items-center justify-center hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          <svg className="h-4 w-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
