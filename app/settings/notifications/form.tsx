'use client'

import { useState } from 'react'
import {
  EMAIL_CATEGORIES,
  type EmailCategory,
  type EmailPreferencesRow,
} from '@/lib/email-categories'

interface NotificationsFormProps {
  initial:      EmailPreferencesRow
  categoryKeys: EmailCategory[]
}

export function NotificationsForm({ initial, categoryKeys }: NotificationsFormProps) {
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
        Activity emails for your account. Toggle off anything you don&apos;t want.
      </p>

      <ul className="flex flex-col divide-y divide-border">
        {categoryKeys.map((key) => {
          const meta    = EMAIL_CATEGORIES[key]
          const enabled = prefs[key]
          return (
            <li key={key} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{meta.label}</p>
                <p className="text-xs text-text-muted">{meta.description}</p>
              </div>
              <Switch
                checked={enabled}
                onChange={() => toggle(key)}
                disabled={saving}
                label={meta.label}
              />
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

// Geometry: 44×24 track with 2px padding on every side → 40×20 inner area.
// 20×20 thumb slides 0→20px so its right edge lands flush at the right side
// of the inner area. Track has a transparent 1px border in both states so the
// thumb doesn't shift vertically when the active background turns on/off.
function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked:  boolean
  onChange: () => void
  disabled: boolean
  label:    string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`Toggle ${label}`}
      onClick={onChange}
      disabled={disabled}
      className={[
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full p-0.5',
        'border border-transparent transition-colors disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-bg-elevated border-border',
      ].join(' ')}
    >
      <span
        className={[
          'block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150',
          checked ? 'translate-x-5' : 'translate-x-0',
        ].join(' ')}
        aria-hidden="true"
      />
    </button>
  )
}
