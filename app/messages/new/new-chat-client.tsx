'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface TargetProfile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  role: string
}

function AdminBadge() {
  return (
    <svg className="h-3.5 w-3.5 text-accent flex-shrink-0 inline-block" viewBox="0 0 20 20" fill="currentColor" aria-label="Admin">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  )
}

interface Props {
  targetProfile: TargetProfile
  currentUserId: string
}

export function NewChatClient({ targetProfile }: Props) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initials = (targetProfile.display_name || targetProfile.username)[0].toUpperCase()

  async function handleSend() {
    const text = body.trim()
    if (!text || sending) return

    setSending(true)
    setError(null)

    try {
      const res = await fetch('/api/messages/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: targetProfile.id, body: text }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      // Conversation created — navigate to it
      router.push(`/messages/${data.conversationId}`)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 mx-auto w-full max-w-2xl px-4 pb-4">
      {/* Target user header */}
      <div className="flex items-center gap-3 py-4 border-b border-border mb-2">
        <Link
          href="/messages"
          className="md:hidden -ml-1 h-8 w-8 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          aria-label="Back to messages"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="h-9 w-9 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
          {targetProfile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={targetProfile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
              <span className="text-sm font-bold text-white">{initials}</span>
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-text-primary">
              {targetProfile.display_name || targetProfile.username}
            </span>
            {targetProfile.role === 'admin' && <AdminBadge />}
          </div>
          <p className="text-xs text-text-muted">@{targetProfile.username}</p>
        </div>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex items-center justify-center py-16">
        <div className="text-center">
          <div className="h-16 w-16 rounded-full overflow-hidden bg-bg-elevated mx-auto mb-4">
            {targetProfile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={targetProfile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                <span className="text-2xl font-bold text-white">{initials}</span>
              </div>
            )}
          </div>
          <p className="text-sm font-semibold text-text-primary">
            {targetProfile.display_name || targetProfile.username}
          </p>
          <p className="text-xs text-text-muted mt-1">
            Send your first message to start the conversation
          </p>
        </div>
      </div>

      {/* Input */}
      {error && (
        <p className="text-xs text-error mb-2 px-1">{error}</p>
      )}
      <div className="flex gap-2 pt-3 border-t border-border">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${targetProfile.display_name || targetProfile.username}… (Enter to send)`}
          rows={1}
          autoFocus
          className="flex-1 resize-none rounded-xl border border-border bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors max-h-32"
        />
        <button
          onClick={handleSend}
          disabled={!body.trim() || sending}
          className="h-10 w-10 flex-shrink-0 self-end rounded-xl bg-accent text-white flex items-center justify-center hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send"
        >
          {sending ? (
            <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="h-4 w-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
