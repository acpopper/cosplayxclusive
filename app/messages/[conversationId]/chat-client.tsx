'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
  media_paths: string[]   // paths in previews/chat-media/ (public bucket)
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
  const router = useRouter()
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => createClient(), [])

  const [menuOpen, setMenuOpen] = useState(false)
  const [blockModal, setBlockModal] = useState(false)
  const [blockLoading, setBlockLoading] = useState(false)
  const [blockError, setBlockError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  async function handleBlock() {
    if (!otherProfile) return
    setBlockLoading(true)
    setBlockError('')
    const res = await fetch('/api/user/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: otherProfile.id }),
    })
    setBlockLoading(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setBlockError(json.error ?? 'Could not block user.')
      return
    }
    setBlockModal(false)
    router.push('/messages')
    router.refresh()
  }

  const canBlock = otherProfile && otherProfile.role !== 'admin' && currentUserProfile.role !== 'admin'

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
          const row = payload.new as { id: string; sender_id: string; body: string; media_paths: string[]; created_at: string }
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            return [...prev, { ...row, media_paths: row.media_paths ?? [], sender: participantMap[row.sender_id] ?? null }]
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
    <>
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
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-text-primary">
                {otherProfile.display_name || otherProfile.username}
              </span>
              {otherProfile.role === 'admin' && <AdminBadge />}
            </div>
            <p className="text-xs text-text-muted">@{otherProfile.username}</p>
          </div>

          {canBlock && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="h-8 w-8 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
                aria-label="Conversation options"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-20">
                  <button
                    onClick={() => { setMenuOpen(false); setBlockModal(true) }}
                    className="w-full px-3 py-2.5 text-left text-sm text-error hover:bg-error/10 transition-colors"
                  >
                    Block user
                  </button>
                </div>
              )}
            </div>
          )}
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

                {/* Images (auto-messages or future media) */}
                {msg.media_paths?.length > 0 && (
                  <div className={['flex flex-col gap-1 mb-1', msg.media_paths.length > 1 ? 'grid grid-cols-2' : ''].join(' ')}>
                    {msg.media_paths.map((path, idx) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={idx}
                        src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${path}`}
                        alt=""
                        className="rounded-xl max-h-64 w-full object-cover cursor-pointer"
                        onClick={() => window.open(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${path}`, '_blank')}
                      />
                    ))}
                  </div>
                )}

                {/* Text bubble — only render if there's text */}
                {msg.body && (
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
                )}
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

    {blockModal && otherProfile && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={() => { setBlockModal(false); setBlockError('') }}
      >
        <div
          className="bg-bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="text-3xl mb-3">🚫</div>
            <h2 className="text-lg font-bold text-text-primary mb-2">
              Block {otherProfile.display_name || otherProfile.username}?
            </h2>
            <p className="text-sm text-text-secondary mb-1">
              You won&apos;t see their posts or profile, and neither of you will be able to send messages.
            </p>
            <p className="text-xs text-text-muted mb-6">
              You can unblock them anytime from your settings.
            </p>

            {blockError && <p className="text-xs text-error mb-3">{blockError}</p>}

            <div className="flex flex-col gap-2">
              <button
                onClick={handleBlock}
                disabled={blockLoading}
                className="w-full py-2.5 rounded-xl bg-error/10 text-error border border-error/20 text-sm font-medium hover:bg-error/20 transition-colors disabled:opacity-50"
              >
                {blockLoading ? 'Blocking…' : 'Yes, block user'}
              </button>
              <button
                onClick={() => { setBlockModal(false); setBlockError('') }}
                disabled={blockLoading}
                className="w-full py-2.5 rounded-xl bg-bg-elevated border border-border text-text-secondary text-sm font-medium hover:text-text-primary transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
