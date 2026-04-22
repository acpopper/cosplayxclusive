'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const REASONS = [
  { value: 'violence', label: 'Violence or threats' },
  { value: 'nudity',   label: 'Nudity or sexual content' },
  { value: 'underage', label: 'Underage or child-related content' },
  { value: 'hate',     label: 'Hate speech or harassment' },
  { value: 'spam',     label: 'Spam or misleading' },
  { value: 'other',    label: 'Something else' },
] as const

type ReasonValue = typeof REASONS[number]['value']

interface ReportPostDialogProps {
  postId: string
  onClose: () => void
}

export function ReportPostDialog({ postId, onClose }: ReportPostDialogProps) {
  const [reason, setReason] = useState<ReasonValue | null>(null)
  const [details, setDetails] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reason) return
    setLoading(true)
    setError('')
    const res = await fetch(`/api/posts/${postId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, details: details.trim() }),
    })
    const json = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(json.error ?? 'Could not submit report.')
      return
    }
    setSubmitted(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {submitted ? (
          <div className="p-6 text-center">
            <div className="text-3xl mb-2">✓</div>
            <h2 className="text-lg font-bold text-text-primary mb-1">Report received</h2>
            <p className="text-sm text-text-secondary mb-5">
              Our moderators will review this post. Thanks for helping keep the community safe.
            </p>
            <Button size="md" onClick={onClose} className="w-full">Done</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6">
            <h2 className="text-lg font-bold text-text-primary mb-1">Report this post</h2>
            <p className="text-sm text-text-secondary mb-4">
              Tell us why. Reports are sent to moderators and stay anonymous to the creator.
            </p>

            <div className="flex flex-col gap-1.5 mb-4">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={[
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors',
                    reason === r.value
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/40 hover:bg-bg-elevated',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-text-primary">{r.label}</span>
                </label>
              ))}
            </div>

            <label className="text-xs font-medium text-text-secondary block mb-1.5">
              Details <span className="text-text-muted">(optional)</span>
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Anything else moderators should know…"
              className="w-full rounded-xl border border-border bg-bg-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-none"
            />

            {error && <p className="text-xs text-error mt-2">{error}</p>}

            <div className="flex gap-2 mt-5">
              <Button
                type="button"
                variant="ghost"
                size="md"
                onClick={onClose}
                disabled={loading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={loading}
                disabled={!reason}
                className="flex-1"
              >
                Submit report
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
