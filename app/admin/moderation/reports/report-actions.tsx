'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ReportActions({ postId }: { postId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function run(action: 'dismiss' | 'unpublish' | 'delete') {
    if (action === 'delete' && !confirm('Permanently delete this post? This cannot be undone.')) {
      return
    }
    setPending(action)
    setError('')
    const url = action === 'dismiss'
      ? '/api/admin/moderation/reports/resolve'
      : '/api/admin/moderation/post-action'
    const body = action === 'dismiss'
      ? { postId }
      : { postId, action }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setPending(null)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Action failed.')
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1 flex-shrink-0">
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <button
          onClick={() => run('dismiss')}
          disabled={!!pending}
          className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          {pending === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
        </button>
        <button
          onClick={() => run('unpublish')}
          disabled={!!pending}
          className="text-xs px-2.5 py-1 rounded-lg border border-warning/30 text-warning hover:bg-warning/10 transition-colors disabled:opacity-50"
        >
          {pending === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
        </button>
        <button
          onClick={() => run('delete')}
          disabled={!!pending}
          className="text-xs px-2.5 py-1 rounded-lg border border-error/30 text-error hover:bg-error/10 transition-colors disabled:opacity-50"
        >
          {pending === 'delete' ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  )
}
