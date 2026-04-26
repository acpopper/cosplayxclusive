'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Profile, Post } from '@/lib/types'
import { PostCard } from '@/components/post-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Nav } from '@/components/nav'
import posthog from 'posthog-js'

interface PostWithUrls {
  post: Post
  hasAccess: boolean
  mediaUrls: string[]
  previewUrls: string[]
}

interface CreatorProfileClientProps {
  creator: Profile
  postsWithUrls: PostWithUrls[]
  viewerId: string | null
  viewerProfile: Profile | null
  isSubscribed: boolean
  isAdmin: boolean
}

// ─── Modal component ────────────────────────────────────────────────────────
function Modal({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Payment confirmation modal ─────────────────────────────────────────────
function PaymentModal({
  creator,
  onConfirm,
  onClose,
  loading,
  error,
}: {
  creator: Profile
  onConfirm: () => void
  onClose: () => void
  loading: boolean
  error: string | null
}) {
  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        {/* Creator info */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-12 w-12 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
            {creator.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                <span className="text-lg font-bold text-white">
                  {(creator.display_name || creator.username)[0].toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div>
            <p className="font-semibold text-text-primary">
              {creator.display_name || creator.username}
            </p>
            <p className="text-xs text-text-muted">@{creator.username}</p>
          </div>
        </div>

        <h2 className="text-lg font-bold text-text-primary mb-1">Confirm subscription</h2>
        <p className="text-sm text-text-secondary mb-1">
          You&apos;ll be charged{' '}
          <span className="font-semibold text-text-primary">
            ${creator.subscription_price_usd}/month
          </span>{' '}
          and get full access to their exclusive content.
        </p>
        <p className="text-xs text-text-muted mb-6">
          You&apos;ll be redirected to our secure payment page.
        </p>

        {error && <p className="text-xs text-error mb-3">{error}</p>}

        <div className="flex flex-col gap-2">
          <Button
            size="md"
            onClick={onConfirm}
            loading={loading}
            className="w-full shadow-[0_0_20px_rgba(224,64,122,0.3)]"
          >
            Continue to payment →
          </Button>
          <Button size="md" variant="ghost" onClick={onClose} disabled={loading} className="w-full">
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Unsubscribe confirmation modal ─────────────────────────────────────────
function UnsubscribeModal({
  creator,
  onConfirm,
  onClose,
  loading,
  error,
}: {
  creator: Profile
  onConfirm: () => void
  onClose: () => void
  loading: boolean
  error: string | null
}) {
  return (
    <Modal onClose={onClose}>
      <div className="p-6">
        <div className="text-3xl mb-3">⚠️</div>
        <h2 className="text-lg font-bold text-text-primary mb-2">Cancel subscription?</h2>
        <p className="text-sm text-text-secondary mb-1">
          You&apos;re about to cancel your subscription to{' '}
          <span className="font-semibold text-text-primary">
            {creator.display_name || creator.username}
          </span>.
        </p>
        <p className="text-xs text-text-muted mb-6">
          You&apos;ll lose access to their exclusive content immediately.
        </p>

        {error && <p className="text-xs text-error mb-3">{error}</p>}

        <div className="flex flex-col gap-2">
          <Button
            size="md"
            variant="danger"
            onClick={onConfirm}
            loading={loading}
            className="w-full"
          >
            Yes, cancel subscription
          </Button>
          <Button size="md" variant="secondary" onClick={onClose} disabled={loading} className="w-full">
            Keep subscription
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────
export function CreatorProfileClient({
  creator,
  postsWithUrls,
  viewerId,
  viewerProfile,
  isSubscribed,
  isAdmin,
}: CreatorProfileClientProps) {
  const router = useRouter()

  const isFree = creator.subscription_price_usd === 0
  const isOwner = viewerId === creator.id

  // Optimistic subscription state
  const [localSubscribed, setLocalSubscribed] = useState(isSubscribed)

  // Modal: null | 'payment' | 'unsubscribe'
  const [modal, setModal] = useState<'payment' | 'unsubscribe' | null>(null)

  // Loading + error per action
  const [subscribeLoading, setSubscribeLoading] = useState(false)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)
  const [unsubLoading, setUnsubLoading] = useState(false)
  const [unsubError, setUnsubError] = useState<string | null>(null)
  // messageLoading removed — Message button now just navigates, no API call

  // Kebab menu + block flow
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [blockLoading, setBlockLoading] = useState(false)
  const [blockError, setBlockError] = useState<string | null>(null)

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
    setBlockLoading(true)
    setBlockError(null)
    const res = await fetch('/api/user/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: creator.id }),
    })
    setBlockLoading(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setBlockError(json.error ?? 'Could not block user.')
      return
    }
    setBlockModalOpen(false)
    router.refresh()
  }

  function handleFollowClick() {
    if (!viewerId) { router.push('/login'); return }
    if (localSubscribed) {
      // Already subscribed — always confirm before unsubscribing
      setUnsubError(null)
      setModal('unsubscribe')
    } else {
      // Not subscribed — trigger the appropriate sub flow
      if (isFree) {
        // Free: subscribe instantly, no modal
        handleSubscribeFree()
      } else {
        // Paid: show payment confirmation modal
        setSubscribeError(null)
        setModal('payment')
      }
    }
  }

  async function handleSubscribeFree() {
    setSubscribeLoading(true)
    setSubscribeError(null)
    posthog.capture('subscription_initiated', {
      creator_id: creator.id,
      creator_username: creator.username,
      subscription_type: 'free',
    })
    try {
      const res = await fetch('/api/checkout/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId: creator.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubscribeError(data.error ?? 'Something went wrong.')
        return
      }
      setLocalSubscribed(true)
      // Redirect to refresh server state (updates post access, etc.)
      window.location.href = data.url
    } finally {
      setSubscribeLoading(false)
    }
  }

  async function handleSubscribePaid() {
    // Called from inside payment modal
    setSubscribeLoading(true)
    setSubscribeError(null)
    posthog.capture('subscription_initiated', {
      creator_id: creator.id,
      creator_username: creator.username,
      subscription_type: 'paid',
      subscription_price_usd: creator.subscription_price_usd,
    })
    try {
      const res = await fetch('/api/checkout/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId: creator.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setSubscribeError(data.error ?? 'Something went wrong. Please try again.')
        return
      }
      window.location.href = data.url
    } finally {
      setSubscribeLoading(false)
    }
  }

  async function handleUnsubscribe() {
    setUnsubLoading(true)
    setUnsubError(null)
    try {
      const res = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorId: creator.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUnsubError(data.error ?? 'Something went wrong.')
        return
      }
      setLocalSubscribed(false)
      setModal(null)
      // Refresh so post locks reappear
      router.refresh()
    } finally {
      setUnsubLoading(false)
    }
  }

  function handleMessage() {
    if (!viewerId) { router.push('/login'); return }
    // Navigate to the compose page — conversation is only created on first send
    router.push(`/messages/new?with=${creator.id}`)
  }

  return (
    <>
      <div className="min-h-screen bg-bg-base">
        <Nav profile={viewerProfile} />

        {/* Banner */}
        <div className="relative h-44 sm:h-56 w-full overflow-hidden bg-bg-elevated">
          {creator.banner_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.banner_url}
              alt="banner"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-accent/20 via-bg-elevated to-accent-alt/20" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-28 backdrop-blur-md [mask-image:linear-gradient(to_top,black_40%,transparent)]" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-bg-base to-transparent" />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl px-5 pb-12 md:px-4 md:pb-16">
          {/* Profile header */}
          <div className="-mt-12 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
            <div className="flex items-end gap-4">
              {/* Avatar */}
              <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-bg-base overflow-hidden bg-bg-elevated flex-shrink-0 shadow-xl">
                {creator.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={creator.avatar_url}
                    alt={creator.display_name || creator.username}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                    <span className="text-2xl font-bold text-white">
                      {(creator.display_name || creator.username)[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              <div className="mb-1">
                <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
                  {creator.display_name || creator.username}
                </h1>
                <p className="text-sm text-text-secondary">@{creator.username}</p>
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-col items-end gap-1.5 sm:mb-1">
              <div className="flex gap-2">
                {isOwner ? (
                  <Link href="/dashboard/profile">
                    <Button variant="secondary" size="md">Edit Profile</Button>
                  </Link>
                ) : (
                  <>
                    {!isAdmin && (
                      <Button
                        size="md"
                        variant={localSubscribed ? 'secondary' : 'primary'}
                        onClick={handleFollowClick}
                        loading={subscribeLoading && !modal}
                        className={
                          !localSubscribed
                            ? 'shadow-[0_0_20px_rgba(224,64,122,0.3)]'
                            : ''
                        }
                      >
                        {localSubscribed
                          ? (isFree ? '✓ Following' : '✓ Subscribed')
                          : (isFree ? 'Follow for Free' : `Subscribe · $${creator.subscription_price_usd}/mo`)}
                      </Button>
                    )}

                    {/* Message: admins always, others only after following */}
                    {viewerId && (isAdmin || localSubscribed) && (
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={handleMessage}
                      >
                        Message
                      </Button>
                    )}

                    {/* Kebab menu — only for logged-in non-admin viewers looking at someone else */}
                    {viewerId && !isAdmin && !isOwner && (
                      <div className="relative" ref={menuRef}>
                        <button
                          onClick={() => setMenuOpen((o) => !o)}
                          className="h-10 w-10 flex items-center justify-center rounded-xl border border-border bg-bg-elevated text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors"
                          aria-label="More options"
                        >
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                          </svg>
                        </button>
                        {menuOpen && (
                          <div className="absolute right-0 top-full mt-1 w-40 bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-20">
                            <button
                              onClick={() => { setMenuOpen(false); setBlockModalOpen(true) }}
                              className="w-full px-3 py-2.5 text-left text-sm text-error hover:bg-error/10 transition-colors"
                            >
                              Block user
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              {subscribeError && !modal && (
                <p className="text-xs text-error">{subscribeError}</p>
              )}
            </div>
          </div>

          {/* Bio */}
          {creator.bio && (
            <p className="text-text-secondary text-sm mb-4 leading-relaxed">{creator.bio}</p>
          )}

          {/* Tags */}
          {creator.fandom_tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-6">
              {creator.fandom_tags.map((tag) => (
                <Badge key={tag} variant="muted" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="flex gap-4 text-sm text-text-muted mb-8 border-b border-border pb-6">
            <span>
              <span className="text-text-primary font-semibold">{postsWithUrls.length}</span> posts
            </span>
            <span>
              <span className="text-text-primary font-semibold">
                {creator.subscription_price_usd === 0 ? 'Free' : `$${creator.subscription_price_usd}/mo`}
              </span>{' '}
              to subscribe
            </span>
          </div>

          {/* Posts feed */}
          {postsWithUrls.length === 0 ? (
            <div className="text-center py-16 text-text-muted">
              <p className="text-4xl mb-3">✦</p>
              <p className="font-medium text-text-secondary">No posts yet</p>
              <p className="text-sm mt-1">Check back soon!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 max-w-xl mx-auto">
              {postsWithUrls.map(({ post, hasAccess, mediaUrls, previewUrls }) => (
                <PostCard
                  key={post.id}
                  post={post}
                  creator={creator}
                  hasAccess={hasAccess}
                  isSubscribed={localSubscribed}
                  viewerId={viewerId}
                  viewerIsAdmin={isAdmin}
                  mediaUrls={mediaUrls}
                  previewUrls={previewUrls}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payment confirmation modal — paid creators, not yet subscribed */}
      {modal === 'payment' && (
        <PaymentModal
          creator={creator}
          onConfirm={handleSubscribePaid}
          onClose={() => { setModal(null); setSubscribeError(null) }}
          loading={subscribeLoading}
          error={subscribeError}
        />
      )}

      {/* Unsubscribe confirmation modal — paid creators, already subscribed */}
      {modal === 'unsubscribe' && (
        <UnsubscribeModal
          creator={creator}
          onConfirm={handleUnsubscribe}
          onClose={() => { setModal(null); setUnsubError(null) }}
          loading={unsubLoading}
          error={unsubError}
        />
      )}

      {/* Block confirmation modal */}
      {blockModalOpen && (
        <Modal onClose={() => { setBlockModalOpen(false); setBlockError(null) }}>
          <div className="p-6">
            <div className="text-3xl mb-3">🚫</div>
            <h2 className="text-lg font-bold text-text-primary mb-2">
              Block {creator.display_name || creator.username}?
            </h2>
            <p className="text-sm text-text-secondary mb-1">
              They won&apos;t be able to message you. You won&apos;t see their posts or profile.
            </p>
            <p className="text-xs text-text-muted mb-6">
              You can unblock them anytime from your settings.
            </p>

            {blockError && <p className="text-xs text-error mb-3">{blockError}</p>}

            <div className="flex flex-col gap-2">
              <Button
                size="md"
                variant="danger"
                onClick={handleBlock}
                loading={blockLoading}
                className="w-full"
              >
                Yes, block user
              </Button>
              <Button
                size="md"
                variant="secondary"
                onClick={() => { setBlockModalOpen(false); setBlockError(null) }}
                disabled={blockLoading}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
