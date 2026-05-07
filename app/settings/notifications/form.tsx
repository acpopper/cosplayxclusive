'use client'

import { useState } from 'react'
import {
  EMAIL_CATEGORIES,
  TOGGLEABLE_CATEGORIES,
  type EmailCategory,
  type EmailPreferencesRow,
} from '@/lib/email'

interface NotificationsFormProps {
  initial: EmailPreferencesRow
}

export function NotificationsForm({ initial }: NotificationsFormProps) {
  const [prefs, setPrefs]     = useState<EmailPreferencesRow>(initial)
  const [saving, setSaving]   = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError]     = useState<string | null>(null)

  async function toggle(key: keyof EmailPreferencesRow) {
    const next = !prefs[key]
    setPrefs((p) => ({ ...p, [key]: next }))
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/account/email-preferences', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [key]: next }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed')
      setSavedAt(Date.now())
    } catch (e) {
      setPrefs((p) => ({ ...p, [key]: !next }))
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="bg-bg-card border border-border rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-semibold text-text-primary">Optional</h2>
        <span className="text-[11px] text-text-muted">
          {saving ? 'Saving…' : savedAt ? 'Saved' : ''}
        </span>
      </div>
      <p className="text-xs text-text-muted mb-4">
        Control activity, summary, and marketing emails.
      </p>

      <ul className="flex flex-col divide-y divide-border">
        {TOGGLEABLE_CATEGORIES.map((key) => {
          const meta = EMAIL_CATEGORIES[key as EmailCategory]
          const enabled = prefs[key]
          return (
            <li key={key} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{meta.label}</p>
                <p className="text-xs text-text-muted">{meta.description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`Toggle ${meta.label}`}
                onClick={() => toggle(key)}
                disabled={saving}
                className={[
                  'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-50',
                  enabled ? 'bg-accent' : 'bg-bg-elevated border border-border',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    enabled ? 'translate-x-[22px]' : 'translate-x-0.5',
                  ].join(' ')}
                />
              </button>
            </li>
          )
        })}
      </ul>

      {error && <p className="text-xs text-error mt-3">{error}</p>}

      <p className="text-[11px] text-text-muted mt-4 leading-relaxed">
        We&apos;ll keep sending account &amp; payment emails (top section) for safety and compliance.
        If you reply to bounce or report any of our messages as spam, you&apos;ll be added to a
        suppression list and we&apos;ll stop sending entirely.
      </p>
    </section>
  )
}
