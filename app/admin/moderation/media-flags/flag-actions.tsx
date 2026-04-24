'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface FlagActionsProps {
  flagId:  string
  postId:  string | null
  /** Used for Unpublish / Delete actions (only available when source is a post) */
}

export function FlagActions({ flagId, postId }: FlagActionsProps) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError]     = useState('')

  async function dismiss() {
    setPending('dismiss')
    setError('')
    const res = await fetch('/api/admin/moderation/media-flags/resolve', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ flagId }),
    })
    setPending(null)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Action failed.')
      return
    }
    router.refresh()
  }

  async function postAction(action: 'unpublish' | 'delete') {
    if (!postId) return
    if (action === 'delete' && !confirm('Permanently delete this post? This cannot be undone.')) return
    setPending(action)
    setError('')
    const res = await fetch('/api/admin/moderation/post-action', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ postId, action }),
    })
    setPending(null)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Action failed.')
      return
    }
    // Also resolve the flag
    await fetch('/api/admin/moderation/media-flags/resolve', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ flagId }),
    })
    router.refresh()
  }

  return (
    <div className="flex flex-col items-end gap-1 flex-shrink-0">
      <div className="flex items-center gap-1.5 flex-wrap justify-end">
        <button
          onClick={dismiss}
          disabled={!!pending}
          className="text-xs px-2.5 py-1 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          {pending === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
        </button>
        {postId && (
          <>
            <button
              onClick={() => postAction('unpublish')}
              disabled={!!pending}
              className="text-xs px-2.5 py-1 rounded-lg border border-warning/30 text-warning hover:bg-warning/10 transition-colors disabled:opacity-50"
            >
              {pending === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
            </button>
            <button
              onClick={() => postAction('delete')}
              disabled={!!pending}
              className="text-xs px-2.5 py-1 rounded-lg border border-error/30 text-error hover:bg-error/10 transition-colors disabled:opacity-50"
            >
              {pending === 'delete' ? 'Deleting…' : 'Delete'}
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-error mt-0.5">{error}</p>}
    </div>
  )
}
