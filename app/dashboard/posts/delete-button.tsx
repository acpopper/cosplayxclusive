'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function DeletePostButton({ postId }: { postId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDelete() {
    if (!confirm('Delete this post? This cannot be undone.')) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('posts').delete().eq('id', postId)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-xs text-text-muted hover:text-error transition-colors px-2 py-1 rounded-lg hover:bg-error/10 disabled:opacity-50"
    >
      {loading ? '...' : 'Delete'}
    </button>
  )
}
