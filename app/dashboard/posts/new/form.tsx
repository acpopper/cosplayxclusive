'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { setFlash } from '@/lib/flash'
import type { AccessType } from '@/lib/types'

const FLAG_CATEGORY_LABELS: Record<string, string> = {
  'nudity:sexual_activity':       'sexual activity',
  'nudity:sexual_display':        'explicit nudity',
  'nudity:erotica':               'erotica',
  'nudity:very_suggestive':       'very suggestive',
  'suggestive:visibly_undressed': 'visible nudity',
  'suggestive:sextoy':            'sex toys',
}

interface PrecheckResult {
  index:      number
  flagged:    boolean
  categories: string[]
  maxScore:   number
  scores:     unknown
}

interface PrecheckHit {
  index:      number
  categories: string[]
  maxScore:   number
}

const ACCESS_OPTIONS: { value: AccessType; label: string; desc: string }[] = [
  { value: 'free', label: 'Free', desc: 'Visible to everyone' },
  { value: 'subscriber_only', label: 'Subscribers Only', desc: 'Requires active subscription' },
  { value: 'ppv', label: 'Pay Per View', desc: 'Fans pay a one-time price' },
]

type MediaItem = {
  type: 'image' | 'video'
  file: File
  localUrl: string
}

async function captureVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const url = URL.createObjectURL(file)
    video.src = url

    const cleanup = () => URL.revokeObjectURL(url)

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(1, video.duration * 0.1)
    }, { once: true })

    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      canvas.toBlob((blob) => {
        cleanup()
        resolve(blob)
      }, 'image/jpeg', 0.8)
    }, { once: true })

    video.addEventListener('error', () => { cleanup(); resolve(null) }, { once: true })
  })
}

export function NewPostForm({ creatorId }: { creatorId: string }) {
  void creatorId // passed by parent but auth is checked server-side
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [caption, setCaption] = useState('')
  const [accessType, setAccessType] = useState<AccessType>('subscriber_only')
  const [ppvPrice, setPpvPrice] = useState('5.99')
  const [items, setItems] = useState<MediaItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [warning, setWarning] = useState<{ hits: PrecheckHit[] } | null>(null)
  const precheckRef = useRef<PrecheckResult[] | null>(null)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    const valid = selected.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (valid.length !== selected.length) {
      setError('Only image and video files are allowed.')
      return
    }
    if (items.length + valid.length > 10) {
      setError('Maximum 10 items per post.')
      return
    }
    setError('')
    const newItems: MediaItem[] = valid.map(f => ({
      type: f.type.startsWith('video/') ? 'video' : 'image',
      file: f,
      localUrl: URL.createObjectURL(f),
    }))
    setItems(prev => [...prev, ...newItems])
    e.target.value = ''
  }

  function removeItem(index: number) {
    URL.revokeObjectURL(items[index].localUrl)
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  async function performUpload() {
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const videoItems = items.filter(item => item.type === 'video')
      const uploadedVideoPaths: string[] = []
      const videoThumbs: (Blob | null)[] = []

      if (videoItems.length > 0) {
        setProgress(`Uploading ${videoItems.length} video${videoItems.length > 1 ? 's' : ''}…`)
        for (let vi = 0; vi < videoItems.length; vi++) {
          const item = videoItems[vi]
          setProgress(`Uploading video ${vi + 1} of ${videoItems.length}…`)

          const urlRes = await fetch('/api/posts/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: item.file.name, contentType: item.file.type }),
          })
          if (!urlRes.ok) throw new Error('Failed to get upload URL')
          const { path, token } = await urlRes.json()

          const { error: uploadErr } = await supabase.storage
            .from('originals')
            .uploadToSignedUrl(path, token, item.file, { contentType: item.file.type })
          if (uploadErr) throw new Error(`Failed to upload video: ${uploadErr.message}`)

          uploadedVideoPaths.push(path)

          setProgress(`Processing video ${vi + 1} thumbnail…`)
          videoThumbs.push(await captureVideoThumbnail(item.file))
        }
      }

      setProgress('Saving post…')
      const formData = new FormData()
      formData.append('caption', caption)
      formData.append('access_type', accessType)
      if (accessType === 'ppv') formData.append('price_usd', ppvPrice)

      const mediaOrder = items.map(item => item.type)
      formData.append('mediaOrder', JSON.stringify(mediaOrder))

      let videoOrderIdx = 0
      for (const item of items) {
        if (item.type === 'image') {
          formData.append('files', item.file)
        } else {
          formData.append('videoPaths', uploadedVideoPaths[videoOrderIdx])
          const thumb = videoThumbs[videoOrderIdx]
          if (thumb) formData.append('videoThumbs', thumb, 'thumb.jpg')
          videoOrderIdx++
        }
      }

      // Forward precheck scores so the server skips a second Sightengine call.
      if (precheckRef.current) {
        formData.append('precheckResults', JSON.stringify(precheckRef.current))
      }

      const res = await fetch('/api/posts/create', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)

      setFlash('Post published')
      router.push('/dashboard/posts')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
      setProgress('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (items.length === 0) {
      setError('Please select at least one image or video.')
      return
    }
    if (accessType === 'ppv') {
      const price = parseFloat(ppvPrice)
      if (isNaN(price) || price < 1) { setError('PPV price must be at least $1.00'); return }
    }

    setError('')
    precheckRef.current = null

    // Pre-check images for explicit content before doing any uploads.
    const imageItems = items.filter(i => i.type === 'image')
    if (imageItems.length > 0) {
      setLoading(true)
      setProgress('Checking content…')
      try {
        const fd = new FormData()
        for (const it of imageItems) fd.append('files', it.file)
        const res = await fetch('/api/posts/precheck', { method: 'POST', body: fd })
        if (res.ok) {
          const { results } = await res.json() as { results: PrecheckResult[] }
          precheckRef.current = results
          const hits = results.filter(r => r.flagged).map(r => ({
            index:      r.index,
            categories: r.categories,
            maxScore:   r.maxScore,
          }))
          if (hits.length > 0) {
            setLoading(false)
            setProgress('')
            setWarning({ hits })
            return
          }
        }
        // If precheck fails, fall through and let the server handle it during /create.
      } catch {
        // Network error on precheck → don't block, server will still flag for review.
      }
    }

    await performUpload()
  }

  async function confirmUploadAnyway() {
    setWarning(null)
    await performUpload()
  }

  function cancelWarning() {
    setWarning(null)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-xl">
      {/* Media upload */}
      <div>
        <p className="text-sm font-medium text-text-secondary mb-2">Media</p>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-border rounded-2xl p-6 text-center hover:border-accent/40 transition-colors"
        >
          <p className="text-3xl mb-2">📷</p>
          <p className="text-sm text-text-secondary">Click to select images or videos</p>
          <p className="text-xs text-text-muted mt-1">JPEG, PNG, WebP, MP4, MOV · Max 10 items</p>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFiles}
        />

        {items.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mt-3">
            {items.map((item, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated group">
                {item.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.localUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <video src={item.localUrl} className="h-full w-full object-cover" muted playsInline />
                    <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1">
                      <span className="text-[9px] text-white">▶ video</span>
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(i)}
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
        <Button type="button" variant="secondary" size="lg" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" size="lg" loading={loading} className="flex-1">
          Publish Post
        </Button>
      </div>

      {warning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={cancelWarning}
        >
          <div
            className="w-full max-w-md bg-bg-card border border-border rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-2xl mb-2">⚠️</p>
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              Some content may violate our terms
            </h2>
            <p className="text-sm text-text-secondary mb-3">
              Our automated review flagged{' '}
              {warning.hits.length === 1
                ? '1 image'
                : `${warning.hits.length} images`}{' '}
              for explicit content. Posts that violate our terms may be removed and your account may be restricted.
            </p>

            <ul className="text-xs text-text-muted space-y-1 mb-5 max-h-32 overflow-y-auto">
              {warning.hits.map((hit) => {
                const top = hit.categories
                  .map((c) => FLAG_CATEGORY_LABELS[c] ?? c)
                  .slice(0, 3)
                  .join(', ')
                return (
                  <li key={hit.index}>
                    <span className="text-text-secondary">Image {hit.index + 1}:</span>{' '}
                    {top || 'flagged content'}
                    {' · '}
                    <span className="text-text-muted">
                      {Math.round(hit.maxScore * 100)}% confidence
                    </span>
                  </li>
                )
              })}
            </ul>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="md" onClick={cancelWarning}>
                Cancel
              </Button>
              <Button type="button" variant="danger" size="md" onClick={confirmUploadAnyway}>
                Upload anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
