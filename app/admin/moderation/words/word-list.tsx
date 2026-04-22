'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface ModerationRule {
  id: string
  pattern: string
  is_regex: boolean
  created_at: string
}

export function WordsPanel({ initialRules }: { initialRules: ModerationRule[] }) {
  const router = useRouter()
  const [rules, setRules] = useState<ModerationRule[]>(initialRules)
  const [pattern, setPattern] = useState('')
  const [isRegex, setIsRegex] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!pattern.trim()) {
      setError('Enter a word, phrase, or regex.')
      return
    }
    setLoading(true)
    const res = await fetch('/api/admin/moderation/words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: pattern.trim(), isRegex }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(json.error ?? 'Could not add rule.')
      return
    }
    setRules((prev) => [json.rule, ...prev])
    setPattern('')
    setIsRegex(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    const res = await fetch(`/api/admin/moderation/words/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== id))
      router.refresh()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="bg-bg-card border border-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-1">Add a warning pattern</h2>
        <p className="text-xs text-text-muted mb-4">
          Any new chat message that matches one of these patterns will be flagged for review.
          Non-regex patterns match as case-insensitive substrings.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={isRegex ? 'e.g. \\b(scam|fraud)\\b' : 'e.g. send money'}
              maxLength={200}
              className="flex-1"
              required
            />
            <Button type="submit" variant="primary" size="md" loading={loading}>
              Add
            </Button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isRegex}
              onChange={(e) => setIsRegex(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            Treat as regular expression (case-insensitive)
          </label>

          {error && <p className="text-xs text-error">{error}</p>}
        </form>
      </section>

      <section className="bg-bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">
            Active patterns <span className="text-text-muted font-normal">({rules.length})</span>
          </h2>
        </div>

        {rules.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-text-muted">
            No warning patterns yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-sm text-text-primary font-mono truncate">
                      {rule.pattern}
                    </code>
                    {rule.is_regex && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                        regex
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    Added {new Date(rule.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(rule.id)}
                  disabled={deletingId === rule.id}
                  className="text-xs text-text-muted hover:text-error transition-colors px-2 py-1 rounded-lg hover:bg-error/10 disabled:opacity-50"
                >
                  {deletingId === rule.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
