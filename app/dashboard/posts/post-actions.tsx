'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface PostActionsProps {
  postId: string
  published: boolean
}

export function PostActions({ postId, published: initialPublished }: PostActionsProps) {
  const router = useRouter()
  const [published, setPublished] = useState(initialPublished)
  const [toggleLoading, setToggleLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  async function handleTogglePublish() {
    setToggleLoading(true)
    try {
      await fetch(`/api/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !published }),
      })
      setPublished(p => !p)
    } finally {
      setToggleLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this post? This cannot be undone.')) return
    setDeleteLoading(true)
    const supabase = createClient()
    await supabase.from('posts').delete().eq('id', postId)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {/* Edit */}
      <Link
        href={`/dashboard/posts/${postId}/edit`}
        className="text-xs text-text-muted hover:text-text-primary transition-colors px-2 py-1 rounded-lg hover:bg-bg-elevated"
      >
        Edit
      </Link>

      {/* Publish / Unpublish */}
      <button
        onClick={handleTogglePublish}
        disabled={toggleLoading}
        className={[
          'text-xs transition-colors px-2 py-1 rounded-lg disabled:opacity-50',
          published
            ? 'text-text-muted hover:text-warning hover:bg-warning/10'
            : 'text-success hover:bg-success/10',
        ].join(' ')}
        title={published ? 'Click to unpublish (hide from fans)' : 'Click to publish (make visible)'}
      >
        {toggleLoading ? '…' : published ? 'Unpublish' : 'Publish'}
      </button>

      {/* Delete */}
      <button
        onClick={handleDelete}
        disabled={deleteLoading}
        className="text-xs text-text-muted hover:text-error transition-colors px-2 py-1 rounded-lg hover:bg-error/10 disabled:opacity-50"
      >
        {deleteLoading ? '…' : 'Delete'}
      </button>
    </div>
  )
}
