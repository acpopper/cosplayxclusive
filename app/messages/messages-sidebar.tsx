'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface OtherProfile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  role: string
}

interface LastMessage {
  body: string
  media_paths: string[]
  sender_id: string
  created_at: string
}

export interface SidebarConv {
  id: string
  created_at: string
  other: OtherProfile | null
  last_message: LastMessage | null
  unread: boolean
  favorite: boolean
}

type Filter = 'all' | 'unread' | 'favorites'

interface Props {
  currentUserId: string
  initialConversations: SidebarConv[]
}

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
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function MessagesSidebar({ currentUserId, initialConversations }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useMemo(() => createClient(), [])

  const [conversations, setConversations] = useState<SidebarConv[]>(initialConversations)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [markingAll, setMarkingAll] = useState(false)
  const favTogglingRef = useRef<Set<string>>(new Set())

  // Active conversation id from the URL (e.g. /messages/abc-123 → "abc-123").
  // /messages and /messages/new have no active conversation.
  const activeId = useMemo(() => {
    if (!pathname) return null
    const m = pathname.match(/^\/messages\/([^/]+)$/)
    if (!m) return null
    if (m[1] === 'new') return null
    return m[1]
  }, [pathname])

  // On mobile, hide the sidebar whenever a chat or the new-chat composer
  // is taking over the right pane.
  const isOnRightPane = activeId !== null || pathname === '/messages/new'

  // Re-sync from server props when navigation lands on a new conversation —
  // server already marked it read, so the new initialConversations reflect that.
  useEffect(() => {
    setConversations(initialConversations)
  }, [initialConversations])

  // Mark the currently-open chat as read locally — the chat client itself
  // upserts conversation_reads, but we want the UI to clear immediately.
  useEffect(() => {
    if (!activeId) return
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId && c.unread ? { ...c, unread: false } : c)),
    )
  }, [activeId])

  // Realtime: when a new message is inserted in any of the user's conversations,
  // bump that conversation to the top and update preview/unread state.
  useEffect(() => {
    const channel = supabase
      .channel(`sidebar:${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as {
            id: string
            conversation_id: string
            sender_id: string
            body: string
            media_paths: string[] | null
            created_at: string
          }
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === row.conversation_id)
            if (idx === -1) return prev // not one of our conversations (RLS prevents this anyway)
            const next = [...prev]
            const updated: SidebarConv = {
              ...next[idx],
              last_message: {
                body: row.body ?? '',
                media_paths: row.media_paths ?? [],
                sender_id: row.sender_id,
                created_at: row.created_at,
              },
              unread:
                row.sender_id !== currentUserId &&
                row.conversation_id !== activeId,
            }
            next.splice(idx, 1)
            next.unshift(updated)
            return next
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, currentUserId, activeId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return conversations.filter((c) => {
      if (filter === 'unread' && !c.unread) return false
      if (filter === 'favorites' && !c.favorite) return false
      if (q.length > 0) {
        const name = (c.other?.display_name || c.other?.username || '').toLowerCase()
        if (!name.includes(q)) return false
      }
      return true
    })
  }, [conversations, filter, search])

  const unreadCount = useMemo(
    () => conversations.reduce((n, c) => n + (c.unread ? 1 : 0), 0),
    [conversations],
  )

  const handleMarkAll = useCallback(async () => {
    if (markingAll || unreadCount === 0) return
    setMarkingAll(true)
    // Optimistic
    setConversations((prev) => prev.map((c) => (c.unread ? { ...c, unread: false } : c)))
    const res = await fetch('/api/messages/mark-all-read', { method: 'POST' })
    setMarkingAll(false)
    if (!res.ok) {
      // Revert by refreshing server data
      router.refresh()
    }
  }, [markingAll, unreadCount, router])

  const toggleFavorite = useCallback(
    async (convId: string) => {
      if (favTogglingRef.current.has(convId)) return
      favTogglingRef.current.add(convId)

      let nextFavorite = false
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c
          nextFavorite = !c.favorite
          return { ...c, favorite: nextFavorite }
        }),
      )

      const res = await fetch('/api/messages/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: convId, favorite: nextFavorite }),
      })

      favTogglingRef.current.delete(convId)
      if (!res.ok) {
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, favorite: !nextFavorite } : c)),
        )
      }
    },
    [],
  )

  // Hide sidebar on mobile when a chat or new-chat composer is open;
  // show it full-width at /messages.
  const sidebarVisibility = isOnRightPane ? 'hidden md:flex' : 'flex'

  return (
    <aside
      className={[
        sidebarVisibility,
        'w-full md:w-[340px] md:flex-shrink-0 flex-col bg-bg-card md:border-r md:border-border min-h-0',
      ].join(' ')}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-text-primary">Messages</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={markingAll || unreadCount === 0}
              className="h-8 px-2.5 rounded-full text-[11px] font-medium text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Mark all as read"
            >
              Mark all read
            </button>
            <Link
              href="/messages/new"
              className="h-8 w-8 flex items-center justify-center rounded-full text-text-secondary hover:text-accent hover:bg-bg-elevated transition-colors"
              aria-label="New chat"
              title="New chat"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 mb-3">
          <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </FilterPill>
          <FilterPill active={filter === 'unread'} onClick={() => setFilter('unread')}>
            Unread
            {unreadCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-semibold">
                {unreadCount}
              </span>
            )}
          </FilterPill>
          <FilterPill active={filter === 'favorites'} onClick={() => setFilter('favorites')}>
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
            Favorites
          </FilterPill>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full pl-9 pr-3 py-2 rounded-full bg-bg-elevated border border-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyList filter={filter} hasAny={conversations.length > 0} hasQuery={search.length > 0} />
        ) : (
          <ul className="py-1">
            {filtered.map((conv) => (
              <ConversationRow
                key={conv.id}
                conv={conv}
                currentUserId={currentUserId}
                isActive={activeId === conv.id}
                onToggleFavorite={() => toggleFavorite(conv.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors',
        active
          ? 'bg-accent text-white'
          : 'bg-bg-elevated text-text-secondary hover:text-text-primary',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function EmptyList({
  filter,
  hasAny,
  hasQuery,
}: {
  filter: Filter
  hasAny: boolean
  hasQuery: boolean
}) {
  let label = 'No messages yet'
  let hint = "Start a conversation from a creator's profile"
  if (hasAny && hasQuery) {
    label = 'No matches'
    hint = 'Try a different name'
  } else if (hasAny && filter === 'unread') {
    label = "You're all caught up"
    hint = 'No unread messages'
  } else if (hasAny && filter === 'favorites') {
    label = 'No favorites yet'
    hint = 'Tap the star on a chat to save it here'
  }
  return (
    <div className="text-center py-12 px-6">
      <p className="text-sm font-medium text-text-secondary">{label}</p>
      <p className="text-xs text-text-muted mt-1">{hint}</p>
    </div>
  )
}

function ConversationRow({
  conv,
  currentUserId,
  isActive,
  onToggleFavorite,
}: {
  conv: SidebarConv
  currentUserId: string
  isActive: boolean
  onToggleFavorite: () => void
}) {
  const other = conv.other
  const initials = (other?.display_name || other?.username || '?')[0].toUpperCase()
  const lastMsg = conv.last_message

  let preview = 'No messages yet'
  if (lastMsg) {
    if (!lastMsg.body && lastMsg.media_paths.length > 0) preview = '📷 Photo'
    else preview = lastMsg.body
  }
  const isMine = lastMsg?.sender_id === currentUserId

  return (
    <li
      className={[
        'group flex items-center gap-3 px-3 py-2.5 mx-1 rounded-xl transition-colors',
        isActive ? 'bg-bg-elevated' : 'hover:bg-bg-elevated/60',
      ].join(' ')}
    >
      <Link href={`/messages/${conv.id}`} className="flex-1 min-w-0 flex items-center gap-3">
        <div className="h-12 w-12 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
          {other?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={other.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
              <span className="text-base font-bold text-white">{initials}</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p
              className={[
                'text-sm truncate',
                conv.unread ? 'font-bold text-text-primary' : 'font-semibold text-text-primary',
              ].join(' ')}
            >
              {other?.display_name || other?.username || 'Unknown'}
            </p>
            {other?.role === 'admin' && <AdminBadge />}
          </div>
          <p
            className={[
              'text-xs truncate mt-0.5',
              conv.unread ? 'text-text-primary font-medium' : 'text-text-muted',
            ].join(' ')}
          >
            {isMine && <span className="text-text-muted">You: </span>}
            {preview}
            {lastMsg && (
              <>
                <span className="text-text-muted"> · </span>
                <span className="text-text-muted">{formatTime(lastMsg.created_at)}</span>
              </>
            )}
          </p>
        </div>
      </Link>

      {/* Right cluster — favorite toggle + unread dot.
          Star is always visible when favorited; otherwise reveals on row hover. */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onToggleFavorite}
          className={[
            'h-7 w-7 flex items-center justify-center rounded-full transition-colors',
            conv.favorite
              ? 'text-amber-400 hover:bg-bg-card'
              : 'text-text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-bg-card',
          ].join(' ')}
          aria-label={conv.favorite ? 'Remove from favorites' : 'Add to favorites'}
          title={conv.favorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg className="h-4 w-4" fill={conv.favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.32-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        </button>
        {conv.unread ? (
          <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-label="Unread" />
        ) : (
          <span className="h-2.5 w-2.5" />
        )}
      </div>
    </li>
  )
}
