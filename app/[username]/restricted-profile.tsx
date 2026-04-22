'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Nav } from '@/components/nav'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/lib/types'

interface RestrictedProfileProps {
  creator: Profile
  viewerProfile: Profile | null
}

export function RestrictedProfile({ creator, viewerProfile }: RestrictedProfileProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleUnblock() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/user/block', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: creator.id }),
    })
    setLoading(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Could not unblock user.')
      return
    }
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <Nav profile={viewerProfile} />

      {/* Banner */}
      <div className="relative h-44 sm:h-56 w-full overflow-hidden bg-bg-elevated">
        {creator.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.banner_url} alt="banner" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/20 via-bg-elevated to-accent-alt/20" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-28 backdrop-blur-md [mask-image:linear-gradient(to_top,black_40%,transparent)]" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-bg-base to-transparent" />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-16">
        <div className="-mt-12 flex items-end gap-4 mb-6">
          <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-bg-base overflow-hidden bg-bg-elevated flex-shrink-0 shadow-xl">
            {creator.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creator.avatar_url} alt={creator.display_name || creator.username} className="h-full w-full object-cover" />
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

        <div className="bg-bg-card border border-border rounded-2xl p-5 text-center flex flex-col items-center gap-3">
          <div className="text-3xl">🚫</div>
          <div>
            <p className="text-sm font-semibold text-text-primary">You blocked this user</p>
            <p className="text-xs text-text-muted mt-1">
              You won&apos;t see their posts or be able to message them while they&apos;re blocked.
              Unblock to restore access.
            </p>
          </div>
          <div className="flex gap-2 mt-1">
            <Button variant="primary" size="md" onClick={handleUnblock} loading={loading}>
              Unblock
            </Button>
            <Link href="/settings">
              <Button variant="secondary" size="md">Manage blocks</Button>
            </Link>
          </div>
          {error && <p className="text-xs text-error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
