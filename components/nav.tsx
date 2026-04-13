'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Notification } from '@/lib/types'

interface NavProps {
  profile: Profile | null
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function Nav({ profile }: NavProps) {
  const pathname = usePathname()
  const router = useRouter()

  const [unreadMsgs, setUnreadMsgs] = useState(0)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const fetchCounts = useCallback(async () => {
    if (!profile) return
    const supabase = createClient()

    // Unread message count via DB function
    const { data: msgCount } = await supabase.rpc('count_unread_conversations')
    setUnreadMsgs(msgCount ?? 0)

    // Unread notification count + recent list (creators only)
    if (profile.role === 'creator' || profile.role === 'admin') {
      const { data: notifData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(20)

      const all = (notifData ?? []) as Notification[]
      setNotifs(all)
      setUnreadNotifs(all.filter((n) => !n.read_at).length)
    }
  }, [profile])

  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, 30_000)
    return () => clearInterval(interval)
  }, [fetchCounts])

  // Close notification panel when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function markNotifsRead() {
    if (!profile || unreadNotifs === 0) return
    const supabase = createClient()
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', profile.id)
      .is('read_at', null)
    setUnreadNotifs(0)
    setNotifs((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const isCreatorOrAdmin = profile?.role === 'creator' || profile?.role === 'admin'

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg-base/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link
          href={profile ? '/explore' : '/'}
          className="flex items-center gap-2 font-semibold text-text-primary"
        >
          <span className="text-accent text-xl">✦</span>
          <span className="hidden sm:inline">CosplayXclusive</span>
          <span className="sm:hidden font-bold text-accent">CX</span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {profile ? (
            <>
              <Link
                href="/explore"
                className={[
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  pathname.startsWith('/explore')
                    ? 'text-text-primary bg-bg-elevated'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                ].join(' ')}
              >
                Explore
              </Link>

              {/* Messages link with unread badge */}
              <Link
                href="/messages"
                className={[
                  'relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  pathname.startsWith('/messages')
                    ? 'text-text-primary bg-bg-elevated'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                ].join(' ')}
              >
                Messages
                {unreadMsgs > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center leading-none">
                    {unreadMsgs > 99 ? '99+' : unreadMsgs}
                  </span>
                )}
              </Link>

              {profile.role === 'creator' && (
                <Link
                  href="/dashboard"
                  className={[
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    pathname.startsWith('/dashboard')
                      ? 'text-text-primary bg-bg-elevated'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                  ].join(' ')}
                >
                  Dashboard
                </Link>
              )}

              {profile.role === 'admin' && (
                <Link
                  href="/admin"
                  className={[
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    pathname.startsWith('/admin')
                      ? 'text-text-primary bg-bg-elevated'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                  ].join(' ')}
                >
                  Admin
                </Link>
              )}

              {/* Notification bell — creators and admins only */}
              {isCreatorOrAdmin && (
                <div className="relative" ref={notifRef}>
                  <button
                    onClick={() => {
                      setNotifOpen((o) => !o)
                      if (!notifOpen) markNotifsRead()
                    }}
                    className="relative h-8 w-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                    aria-label="Notifications"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.75}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                    {unreadNotifs > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center leading-none">
                        {unreadNotifs > 99 ? '99+' : unreadNotifs}
                      </span>
                    )}
                  </button>

                  {/* Notification dropdown */}
                  {notifOpen && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-border">
                        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                          Notifications
                        </p>
                      </div>

                      {notifs.length === 0 ? (
                        <div className="px-4 py-8 text-center text-text-muted text-sm">
                          No notifications yet
                        </div>
                      ) : (
                        <ul className="max-h-80 overflow-y-auto divide-y divide-border">
                          {notifs.map((n) => {
                            const p = n.payload
                            const isFree = p.sub_type === 'free'
                            return (
                              <li
                                key={n.id}
                                className={[
                                  'flex items-start gap-3 px-4 py-3 transition-colors',
                                  !n.read_at ? 'bg-accent/5' : '',
                                ].join(' ')}
                              >
                                {/* Avatar */}
                                <div className="h-8 w-8 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0 mt-0.5">
                                  {p.fan_avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={p.fan_avatar_url} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                                      <span className="text-xs font-bold text-white">
                                        {(p.fan_display_name || p.fan_username || '?')[0].toUpperCase()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {/* Text */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-text-primary leading-snug">
                                    <span className="font-semibold">
                                      {p.fan_display_name || p.fan_username}
                                    </span>{' '}
                                    {isFree ? 'started following you' : 'subscribed to you'}
                                  </p>
                                  <p className="text-xs text-text-muted mt-0.5">{timeAgo(n.created_at)}</p>
                                </div>
                                {/* Unread dot */}
                                {!n.read_at && (
                                  <span className="mt-1.5 h-2 w-2 rounded-full bg-accent flex-shrink-0" />
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Profile avatar */}
              <div className="ml-1 flex items-center gap-2">
                <Link
                  href={profile.role === 'creator' ? `/${profile.username}` : '/explore'}
                  className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-bg-elevated border border-border hover:border-accent/40 transition-colors"
                >
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name || profile.username}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-semibold text-text-secondary">
                      {(profile.display_name || profile.username)[0].toUpperCase()}
                    </span>
                  )}
                </Link>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors px-2 py-1 rounded-lg hover:bg-bg-elevated"
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="ml-1 px-4 py-1.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors shadow-[0_0_15px_rgba(224,64,122,0.25)]"
              >
                Join free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
