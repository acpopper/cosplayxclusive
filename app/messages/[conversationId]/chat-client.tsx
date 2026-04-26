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

interface ReplyTarget {
  id: string
  sender_username: string
  sender_display_name: string | null
  body: string
  has_media: boolean
}

interface MessageItem {
  id: string
  sender_id: string
  body: string
  media_paths: string[]   // paths in previews/chat-media/ (public bucket)
  reply_to_id: string | null
  created_at: string
  sender: SenderProfile | null
  reply_to: ReplyTarget | null
  like_count: number
  has_liked: boolean
}

interface ChatClientProps {
  conversationId: string
  initialMessages: MessageItem[]
  currentUserProfile: SenderProfile
  otherProfile: SenderProfile | null
  canSendMedia: boolean
  initialFavorite: boolean
}

interface MediaHit {
  index:      number
  categories: string[]
  maxScore:   number
}

const MAX_CHAT_IMAGES = 4

const FLAG_LABELS: Record<string, string> = {
  'nudity:sexual_activity':       'sexual activity',
  'nudity:sexual_display':        'explicit nudity',
  'nudity:erotica':               'erotica',
  'nudity:very_suggestive':       'very suggestive',
  'suggestive:visibly_undressed': 'visible nudity',
  'suggestive:sextoy':            'sex toys',
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
  canSendMedia,
  initialFavorite,
}: ChatClientProps) {
  const router = useRouter()
  const [messages, setMessages] = useState<MessageItem[]>(initialMessages)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [pendingImages, setPendingImages] = useState<{ file: File; localUrl: string }[]>([])
  const [mediaWarning, setMediaWarning] = useState<{ hits: MediaHit[] } | null>(null)
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null)
  const [favorite, setFavorite] = useState(initialFavorite)
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabase = useMemo(() => createClient(), [])

  const [menuOpen, setMenuOpen] = useState(false)
  const [blockModal, setBlockModal] = useState(false)
  const [blockLoading, setBlockLoading] = useState(false)
  const [blockError, setBlockError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  // Revoke any leftover object URLs on unmount (navigating away mid-compose).
  const pendingImagesRef = useRef(pendingImages)
  useEffect(() => { pendingImagesRef.current = pendingImages }, [pendingImages])
  useEffect(() => {
    return () => {
      for (const p of pendingImagesRef.current) URL.revokeObjectURL(p.localUrl)
    }
  }, [])

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

  async function toggleFavorite() {
    if (favoriteBusy) return
    setFavoriteBusy(true)
    const next = !favorite
    setFavorite(next) // optimistic
    const res = await fetch('/api/messages/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, favorite: next }),
    })
    setFavoriteBusy(false)
    if (!res.ok) {
      setFavorite(!next)
      return
    }
    // Keep the sidebar (server-rendered in the layout) in sync
    router.refresh()
  }

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

  // Real-time subscription for new messages + like changes.
  // RLS already ensures we only receive events from conversations we participate in.
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
          const row = payload.new as {
            id: string
            sender_id: string
            body: string
            media_paths: string[]
            reply_to_id: string | null
            created_at: string
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            // Resolve quoted reply target from messages already in view.
            const target = row.reply_to_id ? prev.find((m) => m.id === row.reply_to_id) : null
            const reply_to: ReplyTarget | null = target
              ? {
                  id:                  target.id,
                  sender_username:     target.sender?.username ?? '',
                  sender_display_name: target.sender?.display_name ?? null,
                  body:                target.body,
                  has_media:           target.media_paths.length > 0,
                }
              : null
            return [
              ...prev,
              {
                id:           row.id,
                sender_id:    row.sender_id,
                body:         row.body,
                media_paths:  row.media_paths ?? [],
                reply_to_id:  row.reply_to_id,
                created_at:   row.created_at,
                sender:       participantMap[row.sender_id] ?? null,
                reply_to,
                like_count:   0,
                has_liked:    false,
              },
            ]
          })
          markRead()
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_likes' },
        (payload) => {
          const row = payload.new as { message_id: string; user_id: string }
          // Our own likes are applied optimistically — ignore the echo.
          if (row.user_id === currentUserProfile.id) return
          setMessages((prev) =>
            prev.map((m) => (m.id !== row.message_id ? m : { ...m, like_count: m.like_count + 1 })),
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_likes' },
        (payload) => {
          // DELETE payload contains the primary key columns (message_id, user_id).
          const row = payload.old as { message_id?: string; user_id?: string }
          if (!row.message_id) return
          if (row.user_id === currentUserProfile.id) return
          setMessages((prev) =>
            prev.map((m) =>
              m.id !== row.message_id ? m : { ...m, like_count: Math.max(0, m.like_count - 1) },
            ),
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, supabase, participantMap, markRead, currentUserProfile.id])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function startReply(msg: MessageItem) {
    setReplyingTo(msg)
    // Defer to next tick so the textarea is mounted (the reply pill renders above it).
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function cancelReply() {
    setReplyingTo(null)
  }

  function jumpToMessage(id: string) {
    const el = messageRefs.current.get(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-accent')
    setTimeout(() => el.classList.remove('ring-2', 'ring-accent'), 1200)
  }

  async function toggleLike(msg: MessageItem) {
    // Optimistic update — realtime confirmation will re-converge if anything diverges.
    const willLike = !msg.has_liked
    setMessages((prev) =>
      prev.map((m) =>
        m.id !== msg.id
          ? m
          : {
              ...m,
              has_liked:  willLike,
              like_count: Math.max(0, m.like_count + (willLike ? 1 : -1)),
            },
      ),
    )

    if (willLike) {
      const { error } = await supabase
        .from('message_likes')
        .insert({ message_id: msg.id, user_id: currentUserProfile.id })
      if (error && !error.message.toLowerCase().includes('duplicate')) {
        // Revert on real failure.
        setMessages((prev) =>
          prev.map((m) =>
            m.id !== msg.id ? m : { ...m, has_liked: false, like_count: Math.max(0, m.like_count - 1) },
          ),
        )
      }
    } else {
      const { error } = await supabase
        .from('message_likes')
        .delete()
        .eq('message_id', msg.id)
        .eq('user_id', currentUserProfile.id)
      if (error) {
        setMessages((prev) =>
          prev.map((m) => (m.id !== msg.id ? m : { ...m, has_liked: true, like_count: m.like_count + 1 })),
        )
      }
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    setSendError('')
    const selected = Array.from(e.target.files || [])
    e.target.value = ''
    const valid = selected.filter((f) => f.type.startsWith('image/'))
    if (valid.length !== selected.length) {
      setSendError('Only image files are supported.')
    }
    const remaining = MAX_CHAT_IMAGES - pendingImages.length
    if (remaining <= 0) {
      setSendError(`Max ${MAX_CHAT_IMAGES} images per message.`)
      return
    }
    const next = valid.slice(0, remaining).map((f) => ({
      file: f,
      localUrl: URL.createObjectURL(f),
    }))
    setPendingImages((prev) => [...prev, ...next])
  }

  function removePendingImage(index: number) {
    setPendingImages((prev) => {
      URL.revokeObjectURL(prev[index].localUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  async function sendMediaRequest(confirmFlagged: boolean): Promise<{ ok: true } | { ok: false; flagged?: { hits: MediaHit[] }; message?: string }> {
    const fd = new FormData()
    fd.append('conversationId', conversationId)
    fd.append('body', body.trim())
    if (confirmFlagged) fd.append('confirmFlagged', 'true')
    if (replyingTo) fd.append('replyToId', replyingTo.id)
    for (const p of pendingImages) fd.append('files', p.file)

    const res = await fetch('/api/messages/send-media', { method: 'POST', body: fd })
    if (res.ok) return { ok: true }

    const json = await res.json().catch(() => ({} as { error?: string; flagged?: boolean; hits?: MediaHit[] }))
    if (res.status === 422 && json.flagged && Array.isArray(json.hits)) {
      return { ok: false, flagged: { hits: json.hits as MediaHit[] } }
    }
    return { ok: false, message: json.error ?? `Failed to send (${res.status})` }
  }

  async function handleSend() {
    if (sending) return
    const hasText  = body.trim().length > 0
    const hasMedia = pendingImages.length > 0
    if (!hasText && !hasMedia) return

    setSending(true)
    setSendError('')

    try {
      if (hasMedia) {
        const result = await sendMediaRequest(false)
        if (!result.ok) {
          if (result.flagged) {
            setMediaWarning(result.flagged)
            return
          }
          setSendError(result.message ?? 'Failed to send.')
          return
        }
      } else {
        const { error } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id:       currentUserProfile.id,
            body:            body.trim(),
            reply_to_id:     replyingTo?.id ?? null,
          })
        if (error) {
          setSendError(error.message)
          return
        }
      }

      // Success — clear input + previews + reply target
      for (const p of pendingImages) URL.revokeObjectURL(p.localUrl)
      setPendingImages([])
      setBody('')
      setReplyingTo(null)
    } finally {
      setSending(false)
    }
  }

  async function confirmSendFlagged() {
    setMediaWarning(null)
    setSending(true)
    setSendError('')
    try {
      const result = await sendMediaRequest(true)
      if (!result.ok) {
        setSendError(result.message ?? 'Failed to send.')
        return
      }
      for (const p of pendingImages) URL.revokeObjectURL(p.localUrl)
      setPendingImages([])
      setBody('')
      setReplyingTo(null)
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
    <>
    <div className="flex flex-col flex-1 min-h-0 mx-auto w-full max-w-2xl px-4 pb-4">
      {/* Other user header */}
      {otherProfile && (
        <div className="flex items-center gap-3 py-4 border-b border-border mb-2">
          <button
            type="button"
            onClick={() => router.push('/messages')}
            className="md:hidden -ml-1 h-8 w-8 flex items-center justify-center rounded-full text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            aria-label="Back to messages"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
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
              {favorite && (
                <svg
                  className="h-3.5 w-3.5 text-amber-400 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="Favorited"
                >
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              )}
            </div>
            <p className="text-xs text-text-muted">@{otherProfile.username}</p>
          </div>

          <button
            type="button"
            onClick={toggleFavorite}
            disabled={favoriteBusy}
            className={[
              'h-8 w-8 flex items-center justify-center rounded-full transition-colors disabled:opacity-50',
              favorite
                ? 'text-amber-400 hover:bg-bg-elevated'
                : 'text-text-muted hover:text-amber-400 hover:bg-bg-elevated',
            ].join(' ')}
            aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
            title={favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <svg
              className="h-4 w-4"
              fill={favorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.32.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.32-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </button>

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
              ref={(el) => {
                if (el) messageRefs.current.set(msg.id, el)
                else messageRefs.current.delete(msg.id)
              }}
              className={['group flex gap-2 rounded-xl transition-shadow', isMe ? 'flex-row-reverse' : 'flex-row'].join(' ')}
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

                {/* Quoted reply preview */}
                {msg.reply_to && (
                  <button
                    type="button"
                    onClick={() => jumpToMessage(msg.reply_to!.id)}
                    className={[
                      'text-left max-w-full mb-1 px-2.5 py-1.5 rounded-lg border-l-2 text-xs transition-colors cursor-pointer',
                      isMe
                        ? 'bg-accent/10 border-accent/40 hover:bg-accent/15'
                        : 'bg-bg-elevated/60 border-text-muted/40 hover:bg-bg-elevated',
                    ].join(' ')}
                  >
                    <span className="block font-medium text-text-secondary truncate">
                      {msg.reply_to.sender_display_name || msg.reply_to.sender_username}
                    </span>
                    <span className="block text-text-muted truncate">
                      {msg.reply_to.body
                        || (msg.reply_to.has_media ? '📷 Photo' : 'Original message')}
                    </span>
                  </button>
                )}

                {/* Images */}
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

                {/* Bubble row — bubble + hover actions */}
                <div className={['flex items-center gap-1.5', isMe ? 'flex-row-reverse' : 'flex-row'].join(' ')}>
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

                  {/* Hover actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => startReply(msg)}
                      className="h-7 w-7 flex items-center justify-center rounded-full text-text-muted hover:text-accent hover:bg-bg-elevated transition-colors"
                      title="Reply"
                      aria-label="Reply"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h12a4 4 0 014 4v3M3 10l4-4m-4 4l4 4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLike(msg)}
                      className={[
                        'h-7 w-7 flex items-center justify-center rounded-full transition-colors',
                        msg.has_liked
                          ? 'text-error'
                          : 'text-text-muted hover:text-error hover:bg-bg-elevated',
                      ].join(' ')}
                      title={msg.has_liked ? 'Unlike' : 'Like'}
                      aria-label={msg.has_liked ? 'Unlike' : 'Like'}
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill={msg.has_liked ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Time + like count */}
                <div className={['flex items-center gap-2 mt-0.5', isMe ? 'flex-row-reverse' : 'flex-row'].join(' ')}>
                  <span className="text-[11px] text-text-muted">{timeLabel}</span>
                  {msg.like_count > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleLike(msg)}
                      className={[
                        'inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full border transition-colors',
                        msg.has_liked
                          ? 'border-error/30 bg-error/10 text-error'
                          : 'border-border bg-bg-elevated text-text-muted hover:text-error',
                      ].join(' ')}
                      aria-label={`${msg.like_count} like${msg.like_count === 1 ? '' : 's'}`}
                    >
                      <svg
                        className="h-3 w-3"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                      {msg.like_count}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-3 border-t border-border">
        {replyingTo && (
          <div className="flex items-start gap-2 mb-2 px-3 py-2 rounded-xl bg-bg-elevated border-l-2 border-accent">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-text-muted mb-0.5">
                Replying to{' '}
                <span className="font-medium text-text-secondary">
                  {replyingTo.sender?.display_name || replyingTo.sender?.username || 'message'}
                </span>
              </p>
              <p className="text-xs text-text-secondary truncate">
                {replyingTo.body || (replyingTo.media_paths.length > 0 ? '📷 Photo' : '')}
              </p>
            </div>
            <button
              type="button"
              onClick={cancelReply}
              className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors"
              aria-label="Cancel reply"
            >
              ×
            </button>
          </div>
        )}

        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pendingImages.map((p, i) => (
              <div
                key={i}
                className="relative h-20 w-20 rounded-xl overflow-hidden bg-bg-elevated border border-border group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.localUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePendingImage(i)}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center hover:bg-black"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {sendError && (
          <p className="text-xs text-error mb-2">{sendError}</p>
        )}

        <div className="flex gap-2">
          {canSendMedia && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilePick}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || pendingImages.length >= MAX_CHAT_IMAGES}
                className="h-10 w-10 flex-shrink-0 self-end rounded-xl border border-border bg-bg-elevated text-text-secondary flex items-center justify-center hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Attach image"
                title="Attach image"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4-4a3 3 0 014.243 0L20 19.757M14 13l1.879-1.879a3 3 0 014.242 0L22 13M4 6h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zm10 4a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </button>
            </>
          )}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-border bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors max-h-32"
          />
          <button
            onClick={handleSend}
            disabled={(!body.trim() && pendingImages.length === 0) || sending}
            className="h-10 w-10 flex-shrink-0 self-end rounded-xl bg-accent text-white flex items-center justify-center hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    {mediaWarning && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        onClick={() => setMediaWarning(null)}
      >
        <div
          className="w-full max-w-md bg-bg-card border border-border rounded-2xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-2xl mb-2">⚠️</p>
          <h2 className="text-lg font-semibold text-text-primary mb-2">
            Some content may violate our terms
          </h2>
          <p className="text-sm text-text-secondary mb-3">
            Our automated review flagged{' '}
            {mediaWarning.hits.length === 1
              ? '1 image'
              : `${mediaWarning.hits.length} images`}{' '}
            for explicit content. Sending content that violates our terms may result in account restrictions.
          </p>

          <ul className="text-xs text-text-muted space-y-1 mb-5 max-h-32 overflow-y-auto">
            {mediaWarning.hits.map((hit) => {
              const top = hit.categories
                .map((c) => FLAG_LABELS[c] ?? c)
                .slice(0, 3)
                .join(', ')
              return (
                <li key={hit.index}>
                  <span className="text-text-secondary">Image {hit.index + 1}:</span>{' '}
                  {top || 'flagged content'}
                  {' · '}
                  <span className="text-text-muted">
                    {Math.round(hit.maxScore * 100)}% confidence
                  </span>
                </li>
              )
            })}
          </ul>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setMediaWarning(null)}
              className="px-4 py-2 rounded-xl bg-bg-elevated border border-border text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSendFlagged}
              disabled={sending}
              className="px-4 py-2 rounded-xl bg-error/10 border border-error/30 text-sm font-medium text-error hover:bg-error/20 transition-colors disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send anyway'}
            </button>
          </div>
        </div>
      </div>
    )}

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
