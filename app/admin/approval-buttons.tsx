'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function ApprovalButtons({ creatorId }: { creatorId: string }) {
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleAction(action: 'approve' | 'reject') {
    setLoading(action)
    setError(null)
    const res = await fetch('/api/admin/approve-creator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creatorId, action }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? `Error ${res.status}`)
    } else {
      router.refresh()
    }
    setLoading(null)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="danger"
          onClick={() => handleAction('reject')}
          loading={loading === 'reject'}
          disabled={loading !== null}
        >
          Reject
        </Button>
        <Button
          size="sm"
          onClick={() => handleAction('approve')}
          loading={loading === 'approve'}
          disabled={loading !== null}
        >
          Approve
        </Button>
      </div>
    </div>
  )
}
