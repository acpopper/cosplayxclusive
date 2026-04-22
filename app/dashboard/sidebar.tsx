'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Profile } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

interface SidebarProps {
  profile: Profile
}

const approvedNavItems = [
  { href: '/dashboard', label: 'Overview', icon: '◈' },
  { href: '/dashboard/posts', label: 'Posts', icon: '◉' },
  { href: '/dashboard/messaging', label: 'Messaging', icon: '✉' },
  { href: '/dashboard/profile', label: 'Profile', icon: '◎' },
  { href: '/dashboard/connect', label: 'Payouts', icon: '◇' },
]

const pendingNavItems = [
  { href: '/dashboard', label: 'Application', icon: '◈' },
  { href: '/dashboard/profile', label: 'Profile', icon: '◎' },
]

export function DashboardSidebar({ profile }: SidebarProps) {
  const pathname = usePathname()
  const isApproved = profile.creator_status === 'approved'
  const navItems = isApproved ? approvedNavItems : pendingNavItems

  return (
    <aside className="md:w-52 flex-shrink-0">
      <div className="bg-bg-card border border-border rounded-2xl p-3">
        {/* Creator info */}
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
              {profile.creator_status === 'approved' ? (
                <Badge variant="success" className="text-xs py-0">Active</Badge>
              ) : profile.creator_status === 'pending' ? (
                <Badge variant="warning" className="text-xs py-0">Pending review</Badge>
              ) : profile.creator_status === 'rejected' ? (
                <Badge variant="error" className="text-xs py-0">Rejected</Badge>
              ) : (
                <Badge variant="warning" className="text-xs py-0">Suspended</Badge>
              )}
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {navItems.map(({ href, label, icon }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
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
                {label}
              </Link>
            )
          })}
        </nav>

        {/* View profile link — approved only */}
        {isApproved && (
          <div className="mt-3 pt-3 border-t border-border">
            <Link
              href={`/${profile.username}`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-text-muted hover:text-text-secondary hover:bg-bg-elevated transition-colors"
              target="_blank"
            >
              <span>↗</span>
              View public profile
            </Link>
          </div>
        )}
      </div>
    </aside>
  )
}
