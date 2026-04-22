'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function FlagResolveButton({ conversationId }: { conversationId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function handleResolve(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setPending(true)
    setError('')
    const res = await fetch('/api/admin/moderation/flagged/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId }),
    })
    setPending(false)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Failed to resolve.')
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleResolve}
        disabled={pending}
        className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
      >
        {pending ? 'Resolving…' : 'Mark resolved'}
      </button>
      {error && <p className="text-xs text-error mt-0.5">{error}</p>}
    </div>
  )
}
