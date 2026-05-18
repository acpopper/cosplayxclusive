import Link from 'next/link'

export interface RecommendedCreator {
  id:                     string
  username:               string
  display_name:           string | null
  avatar_url:             string | null
  banner_url:             string | null
  subscription_price_usd: number
  fandom_tags:            string[] | null
}

export function RecommendedCreators({ creators }: { creators: RecommendedCreator[] }) {
  if (creators.length === 0) return null

  return (
    <aside className="flex flex-col gap-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          Suggested creators
        </h2>
      </div>

      <div className="flex flex-col gap-3">
        {creators.map((c) => (
          <RecommendedCard key={c.id} creator={c} />
        ))}
      </div>

      <Link
        href="/explore"
        className="text-xs text-text-muted hover:text-accent transition-colors text-center pt-1"
      >
        Browse all creators →
      </Link>
    </aside>
  )
}

export function RecommendedCard({ creator }: { creator: RecommendedCreator }) {
  const initials = (creator.display_name || creator.username || '?')[0].toUpperCase()
  const isFree   = creator.subscription_price_usd === 0
  const priceTag = isFree ? 'Free' : `$${creator.subscription_price_usd}/mo`

  return (
    <Link
      href={`/${creator.username}`}
      className="group block rounded-2xl border border-border bg-bg-card overflow-hidden hover:border-accent/30 transition-colors"
    >
      {/* Banner */}
      <div className="relative h-20 w-full overflow-hidden bg-bg-elevated">
        {creator.banner_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={creator.banner_url}
            alt=""
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/20 via-bg-elevated to-accent-alt/20" />
        )}
        {/* Free / price chip */}
        <span
          className={[
            'absolute top-2 left-2 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold',
            isFree
              ? 'bg-success/20 text-success border border-success/30'
              : 'bg-black/55 text-white',
          ].join(' ')}
        >
          {priceTag}
        </span>
      </div>

      {/* Body */}
      <div className="flex items-center gap-2.5 px-3 pb-3 -mt-5">
        <div className="h-10 w-10 rounded-full border-2 border-bg-card overflow-hidden bg-bg-elevated flex-shrink-0">
          {creator.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.avatar_url} alt={creator.display_name || creator.username} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
              <span className="text-xs font-bold text-white">{initials}</span>
            </div>
          )}
        </div>
        <div className="min-w-0 mt-5">
          <p className="text-sm font-semibold text-text-primary truncate group-hover:text-accent transition-colors">
            {creator.display_name || creator.username}
          </p>
          <p className="text-xs text-text-muted truncate">@{creator.username}</p>
        </div>
      </div>
    </Link>
  )
}
