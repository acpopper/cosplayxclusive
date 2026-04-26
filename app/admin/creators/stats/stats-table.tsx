'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

export interface CreatorStat {
  id:                     string
  username:               string
  display_name:           string | null
  avatar_url:             string | null
  status:                 'approved' | 'suspended'
  subscription_price_usd: number | null
  followers:              number
  posts_total:            number
  posts_last_30:          number
  posts_per_week:         number
  last_post_at:           string | null
  revenue_subscription:   number
  revenue_ppv:            number
  revenue_tip:            number
  revenue_total:          number
}

type SortKey =
  | 'name'
  | 'followers'
  | 'posts_total'
  | 'posts_per_week'
  | 'revenue_subscription'
  | 'revenue_ppv'
  | 'revenue_tip'
  | 'revenue_total'

interface Totals {
  revenue:   number
  revSub:    number
  revPpv:    number
  revTip:    number
  followers: number
  posts:     number
}

const COLUMNS: { key: SortKey; label: string; align?: 'right' }[] = [
  { key: 'name',                 label: 'Creator' },
  { key: 'followers',            label: 'Subs',         align: 'right' },
  { key: 'posts_total',          label: 'Posts',        align: 'right' },
  { key: 'posts_per_week',       label: 'Posts / wk',   align: 'right' },
  { key: 'revenue_subscription', label: 'Sub revenue',  align: 'right' },
  { key: 'revenue_ppv',          label: 'PPV revenue',  align: 'right' },
  { key: 'revenue_tip',          label: 'Tip revenue',  align: 'right' },
  { key: 'revenue_total',        label: 'Total',        align: 'right' },
]

export function StatsTable({ rows, totals }: { rows: CreatorStat[]; totals: Totals }) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue_total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') {
        const an = (a.display_name || a.username).toLowerCase()
        const bn = (b.display_name || b.username).toLowerCase()
        cmp = an.localeCompare(bn)
      } else {
        cmp = (a[sortKey] as number) - (b[sortKey] as number)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue_total))

  return (
    <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bg-elevated/60">
            <tr>
              {COLUMNS.map(({ key, label, align }) => {
                const active = sortKey === key
                const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : ''
                return (
                  <th
                    key={key}
                    scope="col"
                    className={[
                      'px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap',
                      align === 'right' ? 'text-right' : 'text-left',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(key)}
                      className={[
                        'inline-flex items-center gap-1 transition-colors',
                        align === 'right' ? 'flex-row-reverse' : '',
                        active ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary',
                      ].join(' ')}
                    >
                      <span>{label}</span>
                      <span className="text-[9px] w-2 text-accent">{arrow}</span>
                    </button>
                  </th>
                )
              })}
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-text-muted whitespace-nowrap">
                Mix
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <Row key={c.id} c={c} maxRevenue={maxRevenue} />
            ))}
          </tbody>
          <tfoot className="bg-bg-elevated/40 border-t border-border">
            <tr className="text-xs font-semibold text-text-secondary">
              <td className="px-3 py-2.5">Totals</td>
              <td className="px-3 py-2.5 text-right">{totals.followers.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right">{totals.posts.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right text-text-muted">—</td>
              <td className="px-3 py-2.5 text-right">{fmtMoney(totals.revSub)}</td>
              <td className="px-3 py-2.5 text-right">{fmtMoney(totals.revPpv)}</td>
              <td className="px-3 py-2.5 text-right">{fmtMoney(totals.revTip)}</td>
              <td className="px-3 py-2.5 text-right">{fmtMoney(totals.revenue)}</td>
              <td className="px-3 py-2.5">
                <RevenueBar
                  sub={totals.revSub}
                  ppv={totals.revPpv}
                  tip={totals.revTip}
                  total={totals.revenue}
                />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function Row({ c, maxRevenue }: { c: CreatorStat; maxRevenue: number }) {
  const initials = (c.display_name || c.username)[0].toUpperCase()
  const lastPost = c.last_post_at
    ? new Date(c.last_post_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—'

  return (
    <tr className="border-t border-border hover:bg-bg-elevated/40 transition-colors">
      <td className="px-3 py-2.5">
        <Link href={`/${c.username}`} className="flex items-center gap-2.5 min-w-0 group">
          <div className="h-8 w-8 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
            {c.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                <span className="text-xs font-bold text-white">{initials}</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate group-hover:underline">
              {c.display_name || c.username}
              {c.status === 'suspended' && (
                <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                  suspended
                </span>
              )}
            </p>
            <p className="text-[11px] text-text-muted truncate">@{c.username}</p>
          </div>
        </Link>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{c.followers.toLocaleString()}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        <div className="flex flex-col items-end leading-tight">
          <span>{c.posts_total.toLocaleString()}</span>
          {c.posts_last_30 > 0 && (
            <span className="text-[10px] text-text-muted">+{c.posts_last_30} (30d)</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        <div className="flex flex-col items-end leading-tight">
          <span>{c.posts_per_week.toFixed(1)}</span>
          <span className="text-[10px] text-text-muted">last: {lastPost}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(c.revenue_subscription)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(c.revenue_ppv)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(c.revenue_tip)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        <div className="flex flex-col items-end leading-tight">
          <span className="font-semibold">{fmtMoney(c.revenue_total)}</span>
          <ShareBar share={c.revenue_total / maxRevenue} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <RevenueBar
          sub={c.revenue_subscription}
          ppv={c.revenue_ppv}
          tip={c.revenue_tip}
          total={c.revenue_total}
        />
      </td>
    </tr>
  )
}

function ShareBar({ share }: { share: number }) {
  const w = Math.max(0, Math.min(1, share)) * 100
  return (
    <div className="mt-1 w-20 h-1 rounded-full bg-bg-elevated overflow-hidden">
      <div className="h-full bg-accent" style={{ width: `${w}%` }} />
    </div>
  )
}

function RevenueBar({
  sub,
  ppv,
  tip,
  total,
}: {
  sub: number
  ppv: number
  tip: number
  total: number
}) {
  if (total <= 0) {
    return <span className="text-[11px] text-text-muted">—</span>
  }
  const subPct = (sub / total) * 100
  const ppvPct = (ppv / total) * 100
  const tipPct = (tip / total) * 100
  return (
    <div
      className="w-32 h-2 rounded-full bg-bg-elevated overflow-hidden flex"
      title={`Subs ${pct(subPct)} · PPV ${pct(ppvPct)} · Tips ${pct(tipPct)}`}
    >
      <div className="h-full bg-accent" style={{ width: `${subPct}%` }} />
      <div className="h-full bg-success" style={{ width: `${ppvPct}%` }} />
      <div className="h-full bg-warning" style={{ width: `${tipPct}%` }} />
    </div>
  )
}

function pct(n: number) { return `${Math.round(n)}%` }

function fmtMoney(n: number): string {
  if (n === 0) return '$0'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  })
}
