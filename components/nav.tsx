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

// ── Notification bell + dropdown ─────────────────────────────────────────────
// Rendered twice (mobile cluster + desktop nav). Only one is ever interactive
// at a time thanks to responsive visibility classes. State is local — `notifs`
// and `unread` come from the parent so both copies stay in sync.
interface NotifBellProps {
  notifs:     Notification[]
  unread:     number
  onMarkRead: () => void | Promise<void>
}

function NotifBell({ notifs, unread, onMarkRead }: NotifBellProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) onMarkRead() }}
        className="relative h-9 w-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[min(20rem,calc(100vw-1.5rem))] bg-bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
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
            <ul className="max-h-96 overflow-y-auto divide-y divide-border">
              {notifs.map((n) => {
                const p = n.payload
                let avatarUrl: string | null = null
                let avatarInitial = '?'
                let emoji: string | null = null
                let mainText: React.ReactNode = null
                let subText: string | null = null

                if (n.type === 'new_subscriber') {
                  avatarUrl = p.fan_avatar_url ?? null
                  avatarInitial = (p.fan_display_name || p.fan_username || '?')[0].toUpperCase()
                  const name = p.fan_display_name || p.fan_username
                  mainText = <><span className="font-semibold">{name}</span>{' '}{p.sub_type === 'free' ? 'started following you' : 'subscribed to you'}</>
                } else if (n.type === 'post_liked' || n.type === 'post_commented' || n.type === 'post_tipped') {
                  const actors = p.actors ?? []
                  const count = p.actor_count ?? actors.length
                  const first = actors[0]
                  avatarUrl = first?.avatar_url ?? null
                  avatarInitial = (first?.display_name || first?.username || '?')[0]?.toUpperCase() ?? '?'
                  const firstName = first?.display_name || first?.username || 'Someone'
                  const othersCount = count - 1

                  if (n.type === 'post_liked') {
                    mainText = othersCount > 0
                      ? <><span className="font-semibold">{firstName}</span>{' and '}<span className="font-semibold">{othersCount} {othersCount === 1 ? 'other' : 'others'}</span>{' liked your post'}</>
                      : <><span className="font-semibold">{firstName}</span>{' liked your post'}</>
                  } else if (n.type === 'post_commented') {
                    mainText = othersCount > 0
                      ? <><span className="font-semibold">{firstName}</span>{' and '}<span className="font-semibold">{othersCount} {othersCount === 1 ? 'other' : 'others'}</span>{' commented on your post'}</>
                      : <><span className="font-semibold">{firstName}</span>{' commented on your post'}</>
                    if (p.sample_comment) subText = `"${p.sample_comment}"`
                  } else if (n.type === 'post_tipped') {
                    const total = p.total_tip_amount
                    mainText = othersCount > 0
                      ? <><span className="font-semibold">{firstName}</span>{' and '}<span className="font-semibold">{othersCount} {othersCount === 1 ? 'other' : 'others'}</span>{' tipped'}{total ? <> <span className="text-yellow-400 font-semibold">${total.toFixed(0)}</span> total</> : ''}</>
                      : <><span className="font-semibold">{firstName}</span>{' sent a tip'}{total ? <> <span className="text-yellow-400 font-semibold">${total.toFixed(0)}</span></> : ''}</>
                  }
                } else if (n.type === 'post_like_milestone') {
                  emoji = '🎉'
                  mainText = <>Your post reached <span className="font-semibold">{p.milestone} likes</span>!</>
                } else if (n.type === 'post_comment_milestone') {
                  emoji = '💬'
                  mainText = <>Your post reached <span className="font-semibold">{p.milestone} comments</span>!</>
                } else if (n.type === 'post_tip_milestone') {
                  emoji = '💰'
                  mainText = <>Your post received <span className="font-semibold">{p.milestone} tips</span>!</>
                }

                const timestamp = n.last_activity_at || n.created_at

                return (
                  <li
                    key={n.id}
                    className={['flex items-start gap-3 px-4 py-3 transition-colors', !n.read_at ? 'bg-accent/5' : ''].join(' ')}
                  >
                    {emoji ? (
                      <div className="h-8 w-8 rounded-full bg-bg-elevated flex items-center justify-center flex-shrink-0 mt-0.5 text-base">
                        {emoji}
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0 mt-0.5">
                        {avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                            <span className="text-xs font-bold text-white">{avatarInitial}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary leading-snug">{mainText}</p>
                      {subText && <p className="text-xs text-text-muted mt-0.5 truncate italic">{subText}</p>}
                      <p className="text-xs text-text-muted mt-0.5">{timeAgo(timestamp)}</p>
                    </div>
                    {!n.read_at && <span className="mt-1.5 h-2 w-2 rounded-full bg-accent flex-shrink-0" />}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export function Nav({ profile }: NavProps) {
  const pathname = usePathname()
  const router = useRouter()

  const [unreadMsgs, setUnreadMsgs] = useState(0)
  const [unreadNotifs, setUnreadNotifs] = useState(0)
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const isApprovedCreator = profile?.creator_status === 'approved'
  const isAdmin = profile?.role === 'admin'
  const hasCreatorDashboard = profile?.creator_status != null
  const showNotifBell = isApprovedCreator || isAdmin

  const fetchCounts = useCallback(async () => {
    if (!profile) return
    const supabase = createClient()

    const { data: msgCount } = await supabase.rpc('count_unread_conversations')
    setUnreadMsgs(msgCount ?? 0)

    if (showNotifBell) {
      const { data: notifData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('last_activity_at', { ascending: false })
        .limit(30)

      const all = (notifData ?? []) as Notification[]
      setNotifs(all)
      setUnreadNotifs(all.filter((n) => !n.read_at).length)
    }
  }, [profile, showNotifBell])

  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, 30_000)
    return () => clearInterval(interval)
  }, [fetchCounts])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // Esc closes the drawer
  useEffect(() => {
    if (!drawerOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (!drawerOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

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

  // Shared link styling for the desktop top-bar
  function topLinkClasses(active: boolean): string {
    return [
      'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
      active
        ? 'text-text-primary bg-bg-elevated'
        : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
    ].join(' ')
  }

  // Shared link styling for the mobile drawer
  function drawerLinkClasses(active: boolean): string {
    return [
      'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
      active
        ? 'text-text-primary bg-bg-elevated'
        : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
    ].join(' ')
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-bg-base/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          {/* Logo */}
          <Link
            href={profile ? '/home' : '/'}
            className="flex items-center gap-2 font-semibold text-text-primary"
          >
            <span className="text-accent text-xl">✦</span>
            <span className="hidden sm:inline">CosplayXclusive</span>
            <span className="sm:hidden font-bold text-accent">CX</span>
          </Link>

          {/* ── Desktop nav (≥ md) ────────────────────────────────────────── */}
          <nav className="hidden md:flex items-center gap-1">
            {profile ? (
              <>
                <Link href="/home" className={topLinkClasses(pathname.startsWith('/home'))}>
                  Home
                </Link>
                <Link href="/explore" className={topLinkClasses(pathname.startsWith('/explore'))}>
                  Explore
                </Link>
                <Link
                  href="/messages"
                  className={['relative', topLinkClasses(pathname.startsWith('/messages'))].join(' ')}
                >
                  Messages
                  {unreadMsgs > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {unreadMsgs > 99 ? '99+' : unreadMsgs}
                    </span>
                  )}
                </Link>
                <Link
                  href="/collections"
                  className={['flex items-center gap-1.5', topLinkClasses(pathname.startsWith('/collections'))].join(' ')}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  Collections
                </Link>
                {hasCreatorDashboard && (
                  <Link href="/dashboard" className={topLinkClasses(pathname.startsWith('/dashboard'))}>
                    Dashboard
                  </Link>
                )}
                {isAdmin && (
                  <Link href="/admin" className={topLinkClasses(pathname.startsWith('/admin'))}>
                    Admin
                  </Link>
                )}

                {showNotifBell && (
                  <NotifBell notifs={notifs} unread={unreadNotifs} onMarkRead={markNotifsRead} />
                )}

                <div className="ml-1 flex items-center gap-1">
                  <Link
                    href="/settings"
                    className={[
                      'flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-bg-elevated border transition-colors',
                      pathname.startsWith('/settings')
                        ? 'border-accent'
                        : 'border-border hover:border-accent/40',
                    ].join(' ')}
                    title="Settings"
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

          {/* ── Mobile cluster (< md): messages + bell + burger ───────────── */}
          <div className="md:hidden flex items-center gap-1">
            {profile ? (
              <>
                <Link
                  href="/messages"
                  className="relative h-9 w-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                  aria-label="Messages"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {unreadMsgs > 0 && (
                    <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {unreadMsgs > 99 ? '99+' : unreadMsgs}
                    </span>
                  )}
                </Link>

                {showNotifBell && (
                  <NotifBell notifs={notifs} unread={unreadNotifs} onMarkRead={markNotifsRead} />
                )}

                <button
                  onClick={() => setDrawerOpen(true)}
                  className="h-9 w-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                  aria-label="Open menu"
                  aria-expanded={drawerOpen}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
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
                  className="ml-1 px-3 py-1.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
                >
                  Join free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Mobile drawer ─────────────────────────────────────────────────── */}
      {profile && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setDrawerOpen(false)}
            className={[
              'fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden transition-opacity',
              drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
            ].join(' ')}
            aria-hidden={!drawerOpen}
          />
          {/* Panel */}
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className={[
              'fixed top-0 right-0 z-50 h-[100dvh] w-72 max-w-[85vw] bg-bg-card border-l border-border shadow-2xl flex flex-col md:hidden',
              'transition-transform duration-200',
              drawerOpen ? 'translate-x-0' : 'translate-x-full',
            ].join(' ')}
          >
            {/* Header — avatar + close */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <Link
                href="/settings"
                onClick={closeDrawer}
                className="flex items-center gap-3 min-w-0 flex-1"
              >
                <div className="h-10 w-10 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0 border border-border">
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name || profile.username}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                      <span className="text-sm font-bold text-white">
                        {(profile.display_name || profile.username)[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">
                    {profile.display_name || profile.username}
                  </p>
                  <p className="text-xs text-text-muted truncate">@{profile.username}</p>
                </div>
              </Link>
              <button
                onClick={() => setDrawerOpen(false)}
                className="ml-2 h-8 w-8 flex items-center justify-center rounded-full bg-bg-elevated hover:bg-bg-base text-text-secondary hover:text-text-primary transition-colors flex-shrink-0"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            {/* Links */}
            <nav className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
              <Link href="/home" onClick={closeDrawer} className={drawerLinkClasses(pathname.startsWith('/home'))}>
                Home
              </Link>
              <Link href="/explore" onClick={closeDrawer} className={drawerLinkClasses(pathname.startsWith('/explore'))}>
                Explore
              </Link>
              <Link
                href="/messages"
                onClick={closeDrawer}
                className={['relative', drawerLinkClasses(pathname.startsWith('/messages'))].join(' ')}
              >
                <span className="flex-1">Messages</span>
                {unreadMsgs > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-semibold flex items-center justify-center leading-none">
                    {unreadMsgs > 99 ? '99+' : unreadMsgs}
                  </span>
                )}
              </Link>
              <Link
                href="/collections"
                onClick={closeDrawer}
                className={drawerLinkClasses(pathname.startsWith('/collections'))}
              >
                <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <span className="flex-1">Collections</span>
              </Link>
              {hasCreatorDashboard && (
                <Link href="/dashboard" onClick={closeDrawer} className={drawerLinkClasses(pathname.startsWith('/dashboard'))}>
                  Dashboard
                </Link>
              )}
              {isAdmin && (
                <Link href="/admin" onClick={closeDrawer} className={drawerLinkClasses(pathname.startsWith('/admin'))}>
                  Admin
                </Link>
              )}
              <Link href="/settings" onClick={closeDrawer} className={drawerLinkClasses(pathname.startsWith('/settings'))}>
                Settings
              </Link>
            </nav>

            <div className="border-t border-border p-2">
              <button
                onClick={() => { closeDrawer(); handleSignOut() }}
                className="w-full flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
              >
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  )
}
