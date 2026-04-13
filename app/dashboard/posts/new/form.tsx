'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { AccessType } from '@/lib/types'

const ACCESS_OPTIONS: { value: AccessType; label: string; desc: string }[] = [
  { value: 'free', label: 'Free', desc: 'Visible to everyone' },
  { value: 'subscriber_only', label: 'Subscribers Only', desc: 'Requires active subscription' },
  { value: 'ppv', label: 'Pay Per View', desc: 'Fans pay a one-time price' },
]

export function NewPostForm({ creatorId }: { creatorId: string }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [caption, setCaption] = useState('')
  const [accessType, setAccessType] = useState<AccessType>('subscriber_only')
  const [ppvPrice, setPpvPrice] = useState('5.99')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    const valid = selected.filter((f) => f.type.startsWith('image/'))
    if (valid.length !== selected.length) {
      setError('Only image files are allowed.')
      return
    }
    if (files.length + valid.length > 10) {
      setError('Maximum 10 images per post.')
      return
    }
    setError('')
    setFiles((prev) => [...prev, ...valid])
    // Generate local preview URLs
    const urls = valid.map((f) => URL.createObjectURL(f))
    setPreviews((prev) => [...prev, ...urls])
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(previews[index])
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (files.length === 0) {
      setError('Please select at least one image.')
      return
    }

    if (accessType === 'ppv') {
      const price = parseFloat(ppvPrice)
      if (isNaN(price) || price < 1) {
        setError('PPV price must be at least $1.00')
        return
      }
    }

    setError('')
    setLoading(true)
    setProgress('Uploading...')

    try {
      const formData = new FormData()
      formData.append('caption', caption)
      formData.append('access_type', accessType)
      if (accessType === 'ppv') formData.append('price_usd', ppvPrice)
      for (const file of files) formData.append('files', file)

      const res = await fetch('/api/posts/create', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)

      router.push('/dashboard/posts')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
      setProgress('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-xl">
      {/* Image upload */}
      <div>
        <p className="text-sm font-medium text-text-secondary mb-2">Images</p>

        {/* Drop zone */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-2xl p-6 text-center hover:border-accent/40 transition-colors"
        >
          <p className="text-3xl mb-2">📷</p>
          <p className="text-sm text-text-secondary">Click to select images</p>
          <p className="text-xs text-text-muted mt-1">JPEG, PNG, WebP · Max 10 images</p>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFiles}
        />

        {/* Preview grid */}
        {previews.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {previews.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Caption */}
      <Textarea
        label="Caption (optional)"
        placeholder="Tell fans about this post..."
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={3}
        maxLength={2000}
      />

      {/* Access type */}
      <div>
        <p className="text-sm font-medium text-text-secondary mb-2">Access</p>
        <div className="grid grid-cols-3 gap-2">
          {ACCESS_OPTIONS.map(({ value, label, desc }) => (
            <button
              key={value}
              type="button"
              onClick={() => setAccessType(value)}
              className={[
                'flex flex-col items-start p-3 rounded-xl border text-left transition-all',
                accessType === value
                  ? 'border-accent bg-accent-muted'
                  : 'border-border bg-bg-elevated hover:border-accent/30',
              ].join(' ')}
            >
              <p className={['text-sm font-semibold', accessType === value ? 'text-accent' : 'text-text-primary'].join(' ')}>
                {label}
              </p>
              <p className="text-xs text-text-muted mt-0.5">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* PPV price */}
      {accessType === 'ppv' && (
        <Input
          label="PPV Price (USD)"
          type="number"
          placeholder="5.99"
          value={ppvPrice}
          onChange={(e) => setPpvPrice(e.target.value)}
          min="1"
          max="999"
          step="0.01"
        />
      )}

      {error && (
        <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading && progress && (
        <p className="text-sm text-text-secondary">{progress}</p>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg" loading={loading} className="flex-1">
          Publish Post
        </Button>
      </div>
    </form>
  )
}
