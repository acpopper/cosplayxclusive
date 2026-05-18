'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { RecommendedCreator } from './recommended-creators'

const DEBOUNCE_MS = 500
const MIN_QUERY_LENGTH = 2

type Status = 'idle' | 'loading' | 'ready'

export function CreatorSearch() {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<RecommendedCreator[]>([])
  const [status, setStatus]   = useState<Status>('idle')
  const [open, setOpen]       = useState(false)

  // Most recent fetch id — guards against a slow earlier request overwriting
  // a faster later one when the user types quickly.
  const requestId = useRef(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
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
        const data = await res.json() as { results: RecommendedCreator[] }
        setResults(data.results ?? [])
        setStatus('ready')
      } catch {
        if (myId !== requestId.current) return
        setResults([])
        setStatus('ready')
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  // Close the dropdown when clicking outside the wrapper or pressing Escape.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const trimmed     = query.trim()
  const tooShort    = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH
  const hasResults  = status === 'ready' && results.length > 0
  const noResults   = status === 'ready' && results.length === 0 && trimmed.length >= MIN_QUERY_LENGTH
  const isSearching = status === 'loading' && trimmed.length >= MIN_QUERY_LENGTH

  // Dropdown is shown whenever the user has interacted (focused + typed
  // something) so they always get feedback (hint, loading, results, empty).
  const showDropdown = open && (tooShort || isSearching || hasResults || noResults)

  return (
    <div ref={wrapperRef} className="relative">
      {/* Search input */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { if (query.trim()) setOpen(true) }}
          placeholder="Search creators…"
          className="h-10 w-full rounded-xl border border-border bg-bg-elevated pl-9 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          aria-label="Search creators"
          aria-expanded={showDropdown}
          aria-controls="creator-search-dropdown"
        />
        {trimmed.length > 0 && (
          <button
            type="button"
            onClick={() => { setQuery(''); setOpen(false) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown overlay — absolutely positioned so it never shifts the page */}
      {showDropdown && (
        <div
          id="creator-search-dropdown"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-40 rounded-xl border border-border bg-bg-card shadow-2xl overflow-hidden"
        >
          {tooShort && (
            <p className="px-3 py-3 text-xs text-text-muted">
              Type at least {MIN_QUERY_LENGTH} characters to search.
            </p>
          )}

          {isSearching && (
            <p className="px-3 py-3 text-xs text-text-muted">Searching…</p>
          )}

          {hasResults && (
            <ul className="max-h-80 overflow-y-auto divide-y divide-border">
              {results.map((c) => (
                <li key={c.id} role="option">
                  <ResultRow creator={c} onSelect={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}

          {noResults && (
            <p className="px-3 py-3 text-xs text-text-muted">
              No creators match &quot;{trimmed}&quot;.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ResultRow({ creator, onSelect }: { creator: RecommendedCreator; onSelect: () => void }) {
  const initials = (creator.display_name || creator.username || '?')[0].toUpperCase()
  const isFree   = creator.subscription_price_usd === 0
  const priceTag = isFree ? 'Free' : `$${creator.subscription_price_usd}/mo`

  return (
    <Link
      href={`/${creator.username}`}
      onClick={onSelect}
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-bg-elevated transition-colors"
    >
      <div className="h-9 w-9 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
        {creator.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
            <span className="text-xs font-bold text-white">{initials}</span>
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
