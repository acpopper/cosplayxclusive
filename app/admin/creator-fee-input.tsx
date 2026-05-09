'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface CreatorFeeInputProps {
  creatorId: string
  /** Current per-creator override (null = uses default). */
  initialValue: number | null
  /** Default fee from DEFAULT_STRIPE_FEE — shown as placeholder when no override. */
  defaultFee: number
}

export function CreatorFeeInput({ creatorId, initialValue, defaultFee }: CreatorFeeInputProps) {
  const router = useRouter()
  const initialString = initialValue == null ? '' : String(initialValue)

  const [value, setValue]       = useState(initialString)
  const [savedValue, setSaved]  = useState(initialString)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const dirty = value.trim() !== savedValue.trim()
  const isUsingDefault = savedValue.trim() === ''

  async function save(nextValueStr: string) {
    setSaving(true)
    setError(null)
    const trimmed = nextValueStr.trim()
    const feePercent: number | null = trimmed === '' ? null : Number(trimmed)

    if (feePercent !== null && (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100)) {
      setError('0–100')
      setSaving(false)
      return
    }

    const res = await fetch('/api/admin/creator-fee', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creatorId, feePercent }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? `Error ${res.status}`)
      setSaving(false)
      return
    }

    setSaved(trimmed)
    setValue(trimmed)
    setSaving(false)
    router.refresh()
  }

  function reset() {
    setValue('')
    void save('')
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (dirty) void save(value)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setValue(savedValue)
      setError(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
        Platform fee
      </label>
      <div className="flex items-center gap-1">
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null) }}
            onKeyDown={onKeyDown}
            placeholder={String(defaultFee)}
            disabled={saving}
            className="w-20 pl-2 pr-6 py-1.5 text-sm rounded-lg bg-bg-elevated border border-border focus:border-accent focus:outline-none text-text-primary placeholder:text-text-muted disabled:opacity-50"
            aria-label="Platform fee percent"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text-muted">%</span>
        </div>

        {dirty ? (
          <button
            type="button"
            onClick={() => void save(value)}
            disabled={saving}
            className="px-2 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {saving ? '…' : 'Save'}
          </button>
        ) : !isUsingDefault ? (
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            title="Revert to default fee"
            className="px-2 py-1.5 text-xs rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-accent/30 disabled:opacity-50 transition-colors"
          >
            Reset
          </button>
        ) : null}
      </div>

      <p className="text-[10px] text-text-muted">
        {error
          ? <span className="text-error">{error}</span>
          : isUsingDefault
            ? `Using default (${defaultFee}%)`
            : 'Custom override'}
      </p>
    </div>
  )
}
