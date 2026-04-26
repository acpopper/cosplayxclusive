'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Profile } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

interface SidebarProps {
  profile:         Profile
  moderationCount?: number
}

const navItems = [
  { href: '/admin/creators',   label: 'Creators',     icon: '◈', countKey: null },
  { href: '/admin/moderation', label: 'Moderation',   icon: '◉', countKey: 'moderation' as const },
]

export function AdminSidebar({ profile, moderationCount = 0 }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="md:w-52 flex-shrink-0">
      <div className="bg-bg-card border border-border rounded-2xl p-3">
        {/* Admin info */}
        <div className="flex items-center gap-3 px-2 py-2 mb-3 border-b border-border pb-4">
          <div className="h-9 w-9 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                <span className="text-sm font-bold text-white">
                  {(profile.display_name || profile.username)[0].toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">
              {profile.display_name || profile.username}
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <Badge variant="success" className="text-xs py-0">Admin</Badge>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {navItems.map(({ href, label, icon, countKey }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            const count = countKey === 'moderation' ? moderationCount : 0
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                  active
                    ? 'bg-accent-muted text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                ].join(' ')}
              >
                <span className="text-base">{icon}</span>
                <span className="flex-1">{label}</span>
                {count > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-error/15 text-error text-[11px] font-semibold">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
