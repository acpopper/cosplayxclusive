'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ProfileResult {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  role: string
}

interface Props {
  currentUserId: string
}

function AdminBadge() {
  return (
    <svg className="h-3.5 w-3.5 text-accent flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function NewChatPicker({ currentUserId }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProfileResult[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = useMemo(() => createClient(), [])
  const reqIdRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trimmed = query.trim()

  function handleQueryChange(value: string) {
    setQuery(value)
    const next = value.trim()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (next.length < 1) {
      setLoading(false)
      setResults([])
      return
    }
    setLoading(true)
    const reqId = ++reqIdRef.current
    timeoutRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, role')
        .or(`username.ilike.%${next}%,display_name.ilike.%${next}%`)
        .neq('id', currentUserId)
        .limit(20)
      // Drop stale responses
      if (reqId !== reqIdRef.current) return
      setResults((data ?? []) as ProfileResult[])
      setLoading(false)
    }, 200)
  }

  return (
    <div className="flex flex-col flex-1 mx-auto w-full max-w-2xl px-4 py-4 min-h-0">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Link
          href="/messages"
          className="md:hidden -ml-1 h-8 w-8 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
          aria-label="Back to messages"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="text-base font-semibold text-text-primary">New message</h2>
      </div>

      <label className="flex items-center gap-2 mt-4 px-3 py-2 rounded-full bg-bg-elevated">
        <span className="text-sm text-text-muted">To:</span>
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by username or name"
          autoFocus
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
        />
      </label>

      <div className="flex-1 overflow-y-auto mt-4 -mx-2">
        {trimmed.length === 0 ? (
          <p className="text-center text-xs text-text-muted py-12">
            Search for someone to start a new conversation.
          </p>
        ) : loading ? (
          <p className="text-center text-xs text-text-muted py-6">Searching…</p>
        ) : results.length === 0 ? (
          <p className="text-center text-xs text-text-muted py-12">No matches.</p>
        ) : (
          <ul>
            {results.map((p) => {
              const initials = (p.display_name || p.username)[0].toUpperCase()
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/messages/new?with=${p.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg-elevated/60 transition-colors text-left"
                  >
                    <div className="h-10 w-10 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                          <span className="text-sm font-bold text-white">{initials}</span>
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {p.display_name || p.username}
                        </p>
                        {p.role === 'admin' && <AdminBadge />}
                      </div>
                      <p className="text-xs text-text-muted truncate">@{p.username}</p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
