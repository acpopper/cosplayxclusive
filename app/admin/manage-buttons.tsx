'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { CreatorStatus } from '@/lib/types'

interface ManageButtonsProps {
  creatorId: string
  status: CreatorStatus
}

export function ManageButtons({ creatorId, status }: ManageButtonsProps) {
  const [loading, setLoading] = useState<'suspend' | 'unsuspend' | 'delete' | 'message' | null>(null)
  const [confirm, setConfirm] = useState<'suspend' | 'unsuspend' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleAction(action: 'suspend' | 'unsuspend' | 'delete') {
    setLoading(action)
    setError(null)
    setConfirm(null)

    const res = await fetch('/api/admin/manage-creator', {
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

  async function handleMessage() {
    setLoading('message')
    setError(null)
    const res = await fetch('/api/messages/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: creatorId }),
    })
    const data = await res.json().catch(() => ({}))
    if (data.conversationId) {
      router.push(`/messages/${data.conversationId}`)
    } else {
      setError(data.error ?? 'Could not start chat')
      setLoading(null)
    }
  }

  if (confirm) {
    const isDelete = confirm === 'delete'
    return (
      <div className="flex flex-col items-end gap-1">
        <p className="text-xs text-text-muted max-w-[200px] text-right">
          {isDelete
            ? 'Permanently deletes their account and all content.'
            : confirm === 'suspend'
            ? 'Hides their profile from fans immediately.'
            : 'Re-activates their profile.'}
        </p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setConfirm(null)} disabled={loading !== null}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={isDelete ? 'danger' : 'secondary'}
            onClick={() => handleAction(confirm)}
            loading={loading === confirm}
            disabled={loading !== null}
          >
            Confirm
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={handleMessage}
          loading={loading === 'message'}
          disabled={loading !== null}
        >
          Message
        </Button>

        {status === 'approved' && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirm('suspend')}
            disabled={loading !== null}
          >
            Suspend
          </Button>
        )}

        {status === 'suspended' && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirm('unsuspend')}
            disabled={loading !== null}
          >
            Unsuspend
          </Button>
        )}

        <Button
          size="sm"
          variant="danger"
          onClick={() => setConfirm('delete')}
          disabled={loading !== null}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}
