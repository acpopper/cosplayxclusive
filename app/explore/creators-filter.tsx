'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Profile } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

type SortOption = 'newest' | 'oldest' | 'price_asc' | 'price_desc'

const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
}

type CreatorPreview = Pick<
  Profile,
  'id' | 'username' | 'display_name' | 'bio' | 'avatar_url' | 'subscription_price_usd' | 'fandom_tags' | 'created_at'
>

export function CreatorsFilter({ creators }: { creators: CreatorPreview[] }) {
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [sort, setSort] = useState<SortOption>('newest')

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const c of creators) {
      for (const tag of c.fandom_tags ?? []) set.add(tag)
    }
    return Array.from(set).sort()
  }, [creators])

  const filtered = useMemo(() => {
    let result = creators

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(
        (c) =>
          c.username?.toLowerCase().includes(q) ||
          c.display_name?.toLowerCase().includes(q)
      )
    }

    if (selectedTags.length > 0) {
      result = result.filter((c) =>
        selectedTags.some((tag) => c.fandom_tags?.includes(tag))
      )
    }

    result = [...result].sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      const pa = a.subscription_price_usd ?? 0
      const pb = b.subscription_price_usd ?? 0
      if (sort === 'price_asc') return pa - pb
      if (sort === 'price_desc') return pb - pa
      return 0
    })

    return result
  }, [creators, search, selectedTags, sort])

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  return (
    <div>
      {/* Search + Sort row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
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
            placeholder="Search by name or @handle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-bg-elevated pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
          />
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="h-10 rounded-xl border border-border bg-bg-elevated px-3 text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors cursor-pointer"
        >
          {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {/* Tag pills */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={[
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer',
                selectedTags.includes(tag)
                  ? 'bg-accent text-white border border-accent'
                  : 'bg-bg-card text-text-muted border border-border hover:border-accent/40 hover:text-text-secondary',
              ].join(' ')}
            >
              {tag}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              onClick={() => setSelectedTags([])}
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
            >
              Clear ×
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-24 text-text-muted">
          <p className="text-5xl mb-4">✦</p>
          <p className="text-lg font-medium text-text-secondary">No creators found</p>
          <p className="text-sm mt-2">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((creator) => (
            <CreatorCard key={creator.id} creator={creator} />
          ))}
        </div>
      )}
    </div>
  )
}

function CreatorCard({ creator }: { creator: CreatorPreview }) {
  return (
    <Link
      href={`/${creator.username}`}
      className="group bg-bg-card border border-border rounded-2xl p-4 flex items-start gap-4 hover:border-accent/30 transition-all hover:shadow-[0_0_20px_rgba(224,64,122,0.08)]"
    >
      {/* Avatar */}
      <div className="h-14 w-14 flex-shrink-0 rounded-full overflow-hidden bg-bg-elevated border border-border">
        {creator.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={creator.avatar_url}
            alt={creator.display_name || creator.username}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
            <span className="text-xl font-bold text-white">
              {(creator.display_name || creator.username || '?')[0].toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="font-semibold text-text-primary truncate">
            {creator.display_name || creator.username}
          </p>
          <span className="text-xs text-accent font-medium flex-shrink-0">
            {creator.subscription_price_usd === 0
              ? 'Free'
              : `$${creator.subscription_price_usd}/mo`}
          </span>
        </div>
        <p className="text-xs text-text-secondary mb-2">@{creator.username}</p>

        {creator.bio && (
          <p className="text-xs text-text-muted line-clamp-2 mb-2">{creator.bio}</p>
        )}

        {creator.fandom_tags && creator.fandom_tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {creator.fandom_tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="muted" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
