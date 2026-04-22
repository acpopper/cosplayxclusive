'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import type { AccessType } from '@/lib/types'

const ACCESS_OPTIONS: { value: AccessType; label: string; desc: string }[] = [
  { value: 'free', label: 'Free', desc: 'Visible to everyone' },
  { value: 'subscriber_only', label: 'Subscribers Only', desc: 'Requires active subscription' },
  { value: 'ppv', label: 'Pay Per View', desc: 'Fans pay a one-time price' },
]

type NewMediaItem = {
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
      canvas.toBlob((blob) => { cleanup(); resolve(blob) }, 'image/jpeg', 0.8)
    }, { once: true })
    video.addEventListener('error', () => { cleanup(); resolve(null) }, { once: true })
  })
}

interface EditPostFormProps {
  postId: string
  initialCaption: string
  initialAccessType: string
  initialPrice: string
  existingMediaPaths: string[]
  existingPreviewPaths: string[]
  existingPreviewUrls: string[]
  existingMediaTypes: string[]
}

export function EditPostForm({
  postId,
  initialCaption,
  initialAccessType,
  initialPrice,
  existingMediaPaths,
  existingPreviewPaths,
  existingPreviewUrls,
  existingMediaTypes,
}: EditPostFormProps) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [caption, setCaption] = useState(initialCaption)
  const [accessType, setAccessType] = useState<AccessType>(initialAccessType as AccessType)
  const [ppvPrice, setPpvPrice] = useState(initialPrice)

  const [keptMediaPaths, setKeptMediaPaths] = useState<string[]>(existingMediaPaths)
  const [keptPreviewPaths, setKeptPreviewPaths] = useState<string[]>(existingPreviewPaths)
  const [keptPreviewUrls, setKeptPreviewUrls] = useState<string[]>(existingPreviewUrls)
  const [keptMediaTypes, setKeptMediaTypes] = useState<string[]>(existingMediaTypes)

  const [newItems, setNewItems] = useState<NewMediaItem[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')

  const totalItems = keptMediaPaths.length + newItems.length

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || [])
    const valid = selected.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (valid.length !== selected.length) { setError('Only image and video files are allowed.'); return }
    if (totalItems + valid.length > 10) { setError('Maximum 10 items per post.'); return }
    setError('')
    setNewItems(prev => [...prev, ...valid.map(f => ({
      type: (f.type.startsWith('video/') ? 'video' : 'image') as 'image' | 'video',
      file: f,
      localUrl: URL.createObjectURL(f),
    }))])
    e.target.value = ''
  }

  function removeExisting(index: number) {
    setKeptMediaPaths(prev => prev.filter((_, i) => i !== index))
    setKeptPreviewPaths(prev => prev.filter((_, i) => i !== index))
    setKeptPreviewUrls(prev => prev.filter((_, i) => i !== index))
    setKeptMediaTypes(prev => prev.filter((_, i) => i !== index))
  }

  function removeNew(index: number) {
    URL.revokeObjectURL(newItems[index].localUrl)
    setNewItems(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (totalItems === 0) { setError('A post must have at least one image or video.'); return }
    if (accessType === 'ppv') {
      const price = parseFloat(ppvPrice)
      if (isNaN(price) || price < 1) { setError('PPV price must be at least $1.00'); return }
    }

    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const videoNewItems = newItems.filter(item => item.type === 'video')
      const uploadedVideoPaths: string[] = []
      const videoThumbs: (Blob | null)[] = []

      if (videoNewItems.length > 0) {
        for (let vi = 0; vi < videoNewItems.length; vi++) {
          const item = videoNewItems[vi]
          setProgress(`Uploading video ${vi + 1} of ${videoNewItems.length}…`)

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
          videoThumbs.push(await captureVideoThumbnail(item.file))
        }
      }

      setProgress('Saving changes…')
      const fd = new FormData()
      fd.append('caption', caption)
      fd.append('access_type', accessType)
      if (accessType === 'ppv') fd.append('price_usd', ppvPrice)
      fd.append('keepMediaPaths', JSON.stringify(keptMediaPaths))
      fd.append('keepPreviewPaths', JSON.stringify(keptPreviewPaths))
      fd.append('keepMediaTypes', JSON.stringify(keptMediaTypes))

      const mediaOrder = newItems.map(item => item.type)
      fd.append('mediaOrder', JSON.stringify(mediaOrder))

      let videoOrderIdx = 0
      for (const item of newItems) {
        if (item.type === 'image') {
          fd.append('files', item.file)
        } else {
          fd.append('videoPaths', uploadedVideoPaths[videoOrderIdx])
          const thumb = videoThumbs[videoOrderIdx]
          if (thumb) fd.append('videoThumbs', thumb, 'thumb.jpg')
          videoOrderIdx++
        }
      }

      const res = await fetch(`/api/posts/${postId}`, { method: 'PATCH', body: fd })
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
      <div>
        <p className="text-sm font-medium text-text-secondary mb-2">
          Media
          <span className="text-text-muted font-normal ml-1">({totalItems}/10)</span>
        </p>

        <div className="grid grid-cols-4 gap-2">
          {/* Existing kept items */}
          {keptPreviewUrls.map((url, i) => (
            <div key={`existing-${i}`} className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated group">
              {/* Preview is always a blurred image thumbnail regardless of original type */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {keptMediaTypes[i] === 'video' && (
                <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1">
                  <span className="text-[9px] text-white">▶ video</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeExisting(i)}
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium"
              >
                Remove
              </button>
              <div className="absolute bottom-1 right-1 bg-black/60 rounded px-1">
                <span className="text-[9px] text-white/80">saved</span>
              </div>
            </div>
          ))}

          {/* New items not yet uploaded */}
          {newItems.map((item, i) => (
            <div key={`new-${i}`} className="relative aspect-square rounded-xl overflow-hidden bg-bg-elevated group">
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
                onClick={() => removeNew(i)}
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium"
              >
                Remove
              </button>
              <div className="absolute bottom-1 right-1 bg-accent/80 rounded px-1">
                <span className="text-[9px] text-white">new</span>
              </div>
            </div>
          ))}

          {totalItems < 10 && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-accent/50 flex flex-col items-center justify-center gap-1 text-text-muted hover:text-accent transition-colors"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-[10px]">Add</span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFiles} />
      </div>

      <Textarea
        label="Caption (optional)"
        placeholder="Tell fans about this post..."
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={3}
        maxLength={2000}
      />

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
          Save changes
        </Button>
      </div>
    </form>
  )
}
