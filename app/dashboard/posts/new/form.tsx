'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { setFlash } from '@/lib/flash'
import { MIN_PPV_USD } from '@/lib/ppv-pricing'
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

interface UploadedAsset {
  path:  string
  type:  'image' | 'video' | 'video_thumb'
}

export function NewPostForm({ creatorId }: { creatorId: string }) {
  void creatorId
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [caption, setCaption] = useState('')
  const [accessType, setAccessType] = useState<AccessType>('subscriber_only')
  const [ppvPrice, setPpvPrice] = useState(MIN_PPV_USD.toFixed(2))
  const [items, setItems] = useState<MediaItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [warning, setWarning] = useState<{ hits: PrecheckHit[] } | null>(null)

  // Uploaded paths cached between precheck and create — we re-use the same
  // objects so the server doesn't have to re-download or re-key anything.
  const uploadedRef       = useRef<UploadedAsset[]>([])
  const precheckRef       = useRef<PrecheckResult[] | null>(null)

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
    // Any uploads tied to removed items will become orphans; they're cheap
    // and a janitor sweep can reap them later.
    uploadedRef.current = []
    precheckRef.current = null
  }

  // ── Upload all media items to Supabase storage via signed URLs ──────────
  // Returns one entry per `items[i]` in the same order — image paths and
  // video paths share the array, with video_thumb paths interleaved as a
  // separate type (kept in the same array for clean ordering).
  async function uploadAll(): Promise<UploadedAsset[]> {
    const supabase = createClient()
    const out: UploadedAsset[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      setProgress(`Uploading ${item.type} ${i + 1} of ${items.length}…`)

      // Get a signed URL for the raw media in `originals`.
      const urlRes = await fetch('/api/posts/upload-url', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          filename:    item.file.name,
          contentType: item.file.type,
          bucket:      'originals',
        }),
      })
      if (!urlRes.ok) throw new Error(`Failed to get upload URL (${urlRes.status})`)
      const { path, token } = await urlRes.json() as { path: string; token: string }

      const { error: uploadErr } = await supabase.storage
        .from('originals')
        .uploadToSignedUrl(path, token, item.file, { contentType: item.file.type })
      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

      out.push({ path, type: item.type })

      // For videos, also capture a client-side thumbnail and upload it to
      // the `previews` bucket so the server can pick it up by path.
      if (item.type === 'video') {
        setProgress(`Preparing video ${i + 1} thumbnail…`)
        const thumb = await captureVideoThumbnail(item.file)
        if (thumb) {
          const thumbUrlRes = await fetch('/api/posts/upload-url', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              filename:    'thumb.jpg',
              contentType: 'image/jpeg',
              bucket:      'previews',
            }),
          })
          if (thumbUrlRes.ok) {
            const { path: thumbPath, token: thumbToken } = await thumbUrlRes.json() as { path: string; token: string }
            const { error: thumbErr } = await supabase.storage
              .from('previews')
              .uploadToSignedUrl(thumbPath, thumbToken, thumb, { contentType: 'image/jpeg' })
            if (!thumbErr) {
              out.push({ path: thumbPath, type: 'video_thumb' })
            }
          }
        }
      }
    }

    return out
  }

  // ── Run Sightengine against the just-uploaded image paths ───────────────
  async function runPrecheck(uploaded: UploadedAsset[]): Promise<{ ok: true; results: PrecheckResult[]; hits: PrecheckHit[] } | { ok: false }> {
    const imagePaths = uploaded.filter((u) => u.type === 'image').map((u) => u.path)
    if (imagePaths.length === 0) return { ok: true, results: [], hits: [] }

    setProgress('Checking content…')
    try {
      const res = await fetch('/api/posts/precheck', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ paths: imagePaths }),
      })
      if (!res.ok) return { ok: false }
      const { results } = await res.json() as { results: PrecheckResult[] }
      const hits = results.filter((r) => r.flagged).map((r) => ({
        index:      r.index,
        categories: r.categories,
        maxScore:   r.maxScore,
      }))
      return { ok: true, results, hits }
    } catch {
      return { ok: false }
    }
  }

  // ── Final step: POST /api/posts/create with the path manifest ───────────
  async function finalizePost() {
    setProgress('Saving post…')

    const uploaded   = uploadedRef.current
    const mediaOrder = items.map((item) => item.type)

    // Walk items[] and pluck the matching paths from `uploaded`. Video
    // thumbs immediately follow their video in `uploaded`, so we step the
    // cursor past each thumb after its video is consumed.
    const imagePaths:      string[] = []
    const videoPaths:      string[] = []
    const videoThumbPaths: string[] = []
    let cursor = 0
    for (const item of items) {
      const entry = uploaded[cursor++]
      if (!entry) continue
      if (item.type === 'image') {
        imagePaths.push(entry.path)
      } else {
        videoPaths.push(entry.path)
        const next = uploaded[cursor]
        if (next?.type === 'video_thumb') {
          videoThumbPaths.push(next.path)
          cursor++
        } else {
          videoThumbPaths.push('') // keep alignment if thumb capture failed
        }
      }
    }

    const body = {
      caption,
      access_type:    accessType,
      price_usd:      accessType === 'ppv' ? parseFloat(ppvPrice) : null,
      mediaOrder,
      imagePaths,
      videoPaths,
      videoThumbPaths: videoThumbPaths.filter((p) => p !== ''),
      precheckResults: precheckRef.current ?? undefined,
    }

    const res = await fetch('/api/posts/create', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const raw = await res.text()
    let data: { error?: string; published?: boolean } = {}
    if (raw) {
      try { data = JSON.parse(raw) } catch { /* keep empty */ }
    }
    if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`)

    setFlash(
      data.published === false
        ? 'Saved as draft — connect Stripe to publish your posts.'
        : 'Post published',
    )
    router.push('/dashboard/posts')
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (items.length === 0) {
      setError('Please select at least one image or video.')
      return
    }
    if (accessType === 'ppv') {
      const price = parseFloat(ppvPrice)
      if (isNaN(price) || price < MIN_PPV_USD) {
        setError(`PPV price must be at least $${MIN_PPV_USD.toFixed(2)}`)
        return
      }
    }

    setError('')
    setLoading(true)

    try {
      // Skip re-upload if we already uploaded for the precheck. (The user
      // is confirming after a flag warning — files haven't changed.)
      if (uploadedRef.current.length === 0) {
        uploadedRef.current = await uploadAll()
      }

      const precheck = await runPrecheck(uploadedRef.current)
      if (precheck.ok) {
        precheckRef.current = precheck.results
        if (precheck.hits.length > 0) {
          setLoading(false)
          setProgress('')
          setWarning({ hits: precheck.hits })
          return
        }
      }
      // Precheck failure (network, server) doesn't block — the server-side
      // create path will scan again before storing the post.

      await finalizePost()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
      setProgress('')
    }
  }

  async function confirmUploadAnyway() {
    setWarning(null)
    setLoading(true)
    try {
      await finalizePost()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
      setProgress('')
    }
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
          label={`PPV Price (USD) — min $${MIN_PPV_USD.toFixed(2)}`}
          type="number"
          placeholder={MIN_PPV_USD.toFixed(2)}
          value={ppvPrice}
          onChange={(e) => setPpvPrice(e.target.value)}
          min={MIN_PPV_USD.toString()}
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
