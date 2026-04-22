'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface BlockedUser {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export function BlockedList({ initial }: { initial: BlockedUser[] }) {
  const router = useRouter()
  const [blocked, setBlocked] = useState<BlockedUser[]>(initial)
  const [pendingId, setPendingId] = useState<string | null>(null)

  async function handleUnblock(targetId: string) {
    setPendingId(targetId)
    const res = await fetch('/api/user/block', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId }),
    })
    setPendingId(null)
    if (res.ok) {
      setBlocked((prev) => prev.filter((b) => b.id !== targetId))
      router.refresh()
    }
  }

  if (blocked.length === 0) {
    return <p className="text-sm text-text-muted">You haven&apos;t blocked anyone.</p>
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {blocked.map((u) => (
        <li key={u.id} className="flex items-center gap-3 py-3">
          <div className="h-9 w-9 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
            {u.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                <span className="text-sm font-bold text-white">
                  {(u.display_name || u.username)[0].toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">
              {u.display_name || u.username}
            </p>
            <p className="text-xs text-text-muted truncate">@{u.username}</p>
          </div>
          <button
            onClick={() => handleUnblock(u.id)}
            disabled={pendingId === u.id}
            className="text-xs text-text-muted hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 disabled:opacity-50"
          >
            {pendingId === u.id ? 'Unblocking…' : 'Unblock'}
          </button>
        </li>
      ))}
    </ul>
  )
}
