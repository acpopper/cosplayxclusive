'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS      = 500
const MIN_QUERY_LENGTH = 2

interface SearchResult {
  id:                     string
  username:               string
  display_name:           string | null
  avatar_url:             string | null
  subscription_price_usd: number
}

type Status = 'idle' | 'loading' | 'ready'

interface MobileCreatorSearchProps {
  /** Controlled-open state from the parent (the nav). */
  open:    boolean
  onClose: () => void
}

/**
 * Full-screen creator search panel for mobile. Triggered by the magnifying-
 * glass icon in the navbar; the desktop equivalent lives inline in the home
 * sidebar. Shares the same /api/creators/search backend.
 */
export function MobileCreatorSearch({ open, onClose }: MobileCreatorSearchProps) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus]   = useState<Status>('idle')

  const requestId = useRef(0)
  const inputRef  = useRef<HTMLInputElement>(null)

  // Reset state when the panel closes — next open starts fresh.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
      setStatus('idle')
      return
    }
    // Autofocus the input shortly after the panel renders so the keyboard
    // pops up on mobile without an extra tap.
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  // Debounced search on query change.
  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setStatus('idle')
      return
    }

    setStatus('loading')
    const myId = ++requestId.current
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/creators/search?q=${encodeURIComponent(trimmed)}`)
        if (myId !== requestId.current) return
        if (!res.ok) {
          setResults([])
          setStatus('ready')
          return
        }
        const data = await res.json() as { results: SearchResult[] }
        setResults(data.results ?? [])
        setStatus('ready')
      } catch {
        if (myId !== requestId.current) return
        setResults([])
        setStatus('ready')
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, open])

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lock body scroll while the panel is up.
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const trimmed     = query.trim()
  const tooShort    = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH
  const isSearching = status === 'loading' && trimmed.length >= MIN_QUERY_LENGTH
  const hasResults  = status === 'ready' && results.length > 0
  const noResults   = status === 'ready' && results.length === 0 && trimmed.length >= MIN_QUERY_LENGTH

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search creators"
      className="fixed inset-0 z-[60] bg-bg-base flex flex-col"
    >
      {/* Top bar: input + close */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search creators…"
            className="h-10 w-full rounded-xl border border-border bg-bg-elevated pl-9 pr-9 text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
            aria-label="Search creators"
          />
          {trimmed.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-2 rounded-xl text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Body — feedback or results */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tooShort && (
          <p className="text-sm text-text-muted text-center py-8">
            Type at least {MIN_QUERY_LENGTH} characters to search.
          </p>
        )}

        {isSearching && (
          <p className="text-sm text-text-muted text-center py-8 animate-pulse">
            Searching…
          </p>
        )}

        {hasResults && (
          <ul className="flex flex-col divide-y divide-border bg-bg-card border border-border rounded-2xl overflow-hidden">
            {results.map((c) => (
              <li key={c.id}>
                <ResultRow creator={c} onSelect={onClose} />
              </li>
            ))}
          </ul>
        )}

        {noResults && (
          <p className="text-sm text-text-muted text-center py-8">
            No creators match &quot;{trimmed}&quot;.
          </p>
        )}

        {!trimmed && (
          <p className="text-xs text-text-muted text-center py-12">
            Find creators by name or @handle.
          </p>
        )}
      </div>
    </div>
  )
}

function ResultRow({ creator, onSelect }: { creator: SearchResult; onSelect: () => void }) {
  const initials = (creator.display_name || creator.username || '?')[0].toUpperCase()
  const isFree   = creator.subscription_price_usd === 0
  const priceTag = isFree ? 'Free' : `$${creator.subscription_price_usd}/mo`

  return (
    <Link
      href={`/${creator.username}`}
      onClick={onSelect}
      className="flex items-center gap-3 px-3 py-3 hover:bg-bg-elevated transition-colors"
    >
      <div className="h-10 w-10 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
        {creator.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
            <span className="text-sm font-bold text-white">{initials}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {creator.display_name || creator.username}
        </p>
        <p className="text-xs text-text-muted truncate">@{creator.username}</p>
      </div>
      <span
        className={[
          'text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0',
          isFree
            ? 'bg-success/15 text-success border border-success/30'
            : 'bg-accent-muted text-accent',
        ].join(' ')}
      >
        {priceTag}
      </span>
    </Link>
  )
}
