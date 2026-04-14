'use client'

import { useState, useRef } from 'react'

interface AutoMessageConfig {
  new_sub_text: string | null
  new_sub_media: string[]
  returning_sub_text: string | null
  returning_sub_media: string[]
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

function mediaUrl(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/previews/${path}`
}

interface AutoMsgPanelProps {
  type: 'new' | 'returning'
  label: string
  description: string
  emoji: string
  initialText: string | null
  initialMedia: string[]
}

function AutoMsgPanel({ type, label, description, emoji, initialText, initialMedia }: AutoMsgPanelProps) {
  const [text, setText] = useState(initialText ?? '')
  const [mediaPaths, setMediaPaths] = useState<string[]>(initialMedia)
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [newPreviews, setNewPreviews] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const totalImages = mediaPaths.length + newFiles.length
  const canAddMore = totalImages < 3

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter(f => f.type.startsWith('image/'))
    const allowed = 3 - mediaPaths.length - newFiles.length
    const toAdd = picked.slice(0, allowed)
    setNewFiles(prev => [...prev, ...toAdd])
    setNewPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
    e.target.value = ''
  }

  function removeExisting(path: string) {
    setMediaPaths(prev => prev.filter(p => p !== path))
  }

  function removeNew(idx: number) {
    URL.revokeObjectURL(newPreviews[idx])
    setNewFiles(prev => prev.filter((_, i) => i !== idx))
    setNewPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!text.trim() && mediaPaths.length === 0 && newFiles.length === 0) {
      setError('Add a message or at least one image')
      return
    }
    setError(null)
    setSaving(true)
    setSaved(false)

    try {
      const fd = new FormData()
      fd.append('type', type)
      fd.append('text', text)
      fd.append('keepPaths', JSON.stringify(mediaPaths))
      for (const f of newFiles) fd.append('files', f)

      const res = await fetch('/api/dashboard/auto-message', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }

      // Merge returned paths
      setMediaPaths(data.mediaPaths ?? mediaPaths)
      setNewFiles([])
      setNewPreviews([])
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setClearing(true)
    setError(null)
    try {
      await fetch('/api/dashboard/auto-message', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      setText('')
      setMediaPaths([])
      setNewFiles([])
      setNewPreviews([])
    } finally {
      setClearing(false)
    }
  }

  const hasContent = !!text.trim() || mediaPaths.length > 0 || newFiles.length > 0
  const isConfigured = !!(initialText?.trim()) || initialMedia.length > 0

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{emoji}</span>
          <div>
            <p className="text-sm font-semibold text-text-primary">{label}</p>
            <p className="text-xs text-text-muted mt-0.5">{description}</p>
          </div>
        </div>
        {isConfigured && (
          <span className="text-[10px] font-semibold text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full flex-shrink-0">
            Active
          </span>
        )}
      </div>

      {/* Text */}
      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1.5">
          Message text <span className="text-text-muted">(optional)</span>
        </label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={`Hi! Thanks for subscribing…`}
          className="w-full rounded-xl border border-border bg-bg-elevated px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none transition-colors"
        />
        <p className="text-[10px] text-text-muted mt-1 text-right">{text.length}/1000</p>
      </div>

      {/* Media */}
      <div>
        <p className="text-xs font-medium text-text-secondary mb-2">
          Images <span className="text-text-muted">(optional · max 3)</span>
        </p>

        <div className="flex flex-wrap gap-2">
          {/* Existing saved images */}
          {mediaPaths.map((path) => (
            <div key={path} className="relative h-20 w-20 rounded-xl overflow-hidden bg-bg-elevated group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(path)} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeExisting(path)}
                className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs"
              >
                ✕
              </button>
            </div>
          ))}

          {/* Newly selected (not yet uploaded) */}
          {newPreviews.map((url, i) => (
            <div key={i} className="relative h-20 w-20 rounded-xl overflow-hidden bg-bg-elevated group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeNew(i)}
                className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs"
              >
                ✕
              </button>
            </div>
          ))}

          {/* Add button */}
          {canAddMore && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-20 w-20 rounded-xl border-2 border-dashed border-border hover:border-accent/50 flex items-center justify-center text-text-muted hover:text-accent transition-colors"
              aria-label="Add image"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFiles}
        />
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !hasContent}
          className="flex-1 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save'}
        </button>
        {isConfigured && (
          <button
            onClick={handleClear}
            disabled={clearing}
            className="px-4 py-2 rounded-xl border border-border text-sm text-text-muted hover:text-error hover:border-error/30 transition-colors disabled:opacity-40"
          >
            {clearing ? '…' : 'Clear'}
          </button>
        )}
      </div>
    </div>
  )
}

interface Props {
  config: AutoMessageConfig | null
}

export function AutoMessageForm({ config }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <AutoMsgPanel
        type="new"
        label="New subscriber"
        description="Sent automatically when someone follows you for the first time"
        emoji="👋"
        initialText={config?.new_sub_text ?? null}
        initialMedia={config?.new_sub_media ?? []}
      />
      <AutoMsgPanel
        type="returning"
        label="Returning subscriber"
        description="Sent when someone re-subscribes after previously unsubscribing"
        emoji="🔄"
        initialText={config?.returning_sub_text ?? null}
        initialMedia={config?.returning_sub_media ?? []}
      />
    </div>
  )
}
