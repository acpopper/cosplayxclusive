import Link from 'next/link'
import type { RecommendedCreator } from './recommended-creators'

/**
 * Compact, in-feed creator suggestions. Designed to slot between feed posts
 * every ~10 entries without a search bar above it — that lives in the sidebar
 * (desktop) or the nav search overlay (mobile).
 *
 * Renders a horizontally scrollable strip of small cards so it visually
 * differs from a post and works at any feed width.
 */
export function InlineRecommendations({ creators }: { creators: RecommendedCreator[] }) {
  if (creators.length === 0) return null

  return (
    <section
      aria-label="Suggested creators"
      className="bg-bg-card border border-border rounded-2xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
          ✦ Suggested for you
        </p>
        <Link
          href="/explore"
          className="text-xs text-text-muted hover:text-accent transition-colors"
        >
          See all →
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
        {creators.map((c) => (
          <InlineCard key={c.id} creator={c} />
        ))}
      </div>
    </section>
  )
}

function InlineCard({ creator }: { creator: RecommendedCreator }) {
  const initials = (creator.display_name || creator.username || '?')[0].toUpperCase()
  const isFree   = creator.subscription_price_usd === 0
  const priceTag = isFree ? 'Free' : `$${creator.subscription_price_usd}/mo`

  return (
    <Link
      href={`/${creator.username}`}
      className="snap-start shrink-0 w-40 group rounded-xl border border-border bg-bg-elevated overflow-hidden hover:border-accent/30 transition-colors"
    >
      <div className="relative h-16 w-full overflow-hidden">
        {creator.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={creator.banner_url}
            alt=""
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/20 via-bg-card to-accent-alt/20" />
        )}
        <span
          className={[
            'absolute top-1.5 left-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold',
            isFree
              ? 'bg-success/20 text-success border border-success/30'
              : 'bg-black/55 text-white',
          ].join(' ')}
        >
          {priceTag}
        </span>
      </div>
      <div className="flex flex-col items-center px-2 pb-3 -mt-5">
        <div className="h-10 w-10 rounded-full border-2 border-bg-elevated overflow-hidden bg-bg-card flex-shrink-0">
          {creator.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.avatar_url} alt={creator.display_name || creator.username} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
          )}
        </div>
        <p className="mt-1.5 text-xs font-semibold text-text-primary text-center truncate w-full group-hover:text-accent transition-colors">
          {creator.display_name || creator.username}
        </p>
        <p className="text-[10px] text-text-muted text-center truncate w-full">
          @{creator.username}
        </p>
      </div>
    </Link>
  )
}
