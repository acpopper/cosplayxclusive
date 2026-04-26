'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/admin/creators/applications', label: 'Applications', badgeKey: 'pending' as const },
  { href: '/admin/creators/stats',        label: 'Stats',        badgeKey: null },
]

interface CreatorsTabsProps {
  pendingCount?: number
}

export function CreatorsTabs({ pendingCount }: CreatorsTabsProps) {
  const pathname = usePathname()

  function badge(key: 'pending' | null): number | null {
    if (key === 'pending') return pendingCount ?? null
    return null
  }

  return (
    <div className="border-b border-border mb-6">
      <div className="flex gap-1 -mb-px">
        {tabs.map(({ href, label, badgeKey }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          const count = badge(badgeKey)
          return (
            <Link
              key={href}
              href={href}
              className={[
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                active
                  ? 'border-accent text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary',
              ].join(' ')}
            >
              {label}
              {count != null && count > 0 && (
                <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-accent/15 text-accent text-[11px] font-semibold">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
