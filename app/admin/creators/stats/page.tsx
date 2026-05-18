import { createServiceClient } from '@/lib/supabase/server'
import { CreatorsTabs } from '../tabs'
import { StatsTable, type CreatorStat } from './stats-table'
import {
  RevenueOverTimeChart,
  TopEarningCreatorsChart,
  RevenueSourceBreakdown,
  type RevenueByDay,
  type TopCreator,
} from './charts'
import { getStripeStage } from '../stripe-status-pill'
import type { Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'

const REVENUE_WINDOW_DAYS = 30
const TOP_CREATORS_COUNT  = 5

function emptyDailyBuckets(): RevenueByDay[] {
  const days: RevenueByDay[] = []
  const today = new Date()
  for (let i = REVENUE_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push({
      day:   d.toISOString().slice(0, 10),
      sub:   0,
      ppv:   0,
      tip:   0,
      total: 0,
    })
  }
  return days
}

type PostAgg = { count: number; last30: number; firstAt: string | null; lastAt: string | null }

function aggregatePosts(rows: { creator_id: string; created_at: string }[]): Map<string, PostAgg> {
  const cutoff30 = Date.now() - 30 * 86_400_000
  const map = new Map<string, PostAgg>()
  for (const p of rows) {
    const cur = map.get(p.creator_id) ?? { count: 0, last30: 0, firstAt: null, lastAt: null }
    cur.count += 1
    const t = new Date(p.created_at).getTime()
    if (t >= cutoff30) cur.last30 += 1
    if (cur.firstAt === null || p.created_at < cur.firstAt) cur.firstAt = p.created_at
    if (cur.lastAt === null || p.created_at > cur.lastAt) cur.lastAt = p.created_at
    map.set(p.creator_id, cur)
  }
  return map
}

function computePostsPerWeek(count: number, firstAt: string | null): number {
  if (count <= 0 || !firstAt) return 0
  const days = Math.max(1, (Date.now() - new Date(firstAt).getTime()) / 86_400_000)
  return (count / days) * 7
}

export default async function AdminCreatorsStatsPage() {
  const service = createServiceClient()

  // Pull every creator that's been approved (suspended creators kept too —
  // their historical revenue is still relevant context for admins).
  const { data: creators } = await service
    .from('profiles')
    .select('id, username, display_name, avatar_url, creator_status, subscription_price_usd, created_at, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted')
    .in('creator_status', ['approved', 'suspended'])

  const creatorIds = (creators ?? []).map((c) => c.id)

  // Pending count drives the tab badge.
  const { count: pendingCount } = await service
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('creator_status', 'pending')

  const stripePendingCount = (creators ?? []).filter((c) => getStripeStage(c as Profile) !== 'ok').length

  if (creatorIds.length === 0) {
    return (
      <>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Creators</h1>
          <p className="text-sm text-text-secondary mt-1">No approved creators yet</p>
        </div>
        <CreatorsTabs pendingCount={pendingCount ?? 0} stripePendingCount={0} />
        <div className="text-center py-16 text-text-muted bg-bg-card border border-border rounded-2xl">
          <p className="text-3xl mb-3">📊</p>
          <p className="font-medium text-text-secondary">Stats will appear once creators are approved</p>
        </div>
      </>
    )
  }

  // Run the aggregation queries in parallel.
  const [
    { data: subs },
    { data: posts },
    { data: txs },
  ] = await Promise.all([
    service
      .from('subscriptions')
      .select('creator_id, status')
      .in('creator_id', creatorIds),
    service
      .from('posts')
      .select('creator_id, created_at')
      .in('creator_id', creatorIds),
    service
      .from('transactions')
      .select('creator_id, type, amount_usd, created_at')
      .in('creator_id', creatorIds),
  ])

  // Build per-creator aggregates.
  const subMap = new Map<string, number>()
  for (const s of subs ?? []) {
    if (s.status === 'active' || s.status === 'trialing') {
      subMap.set(s.creator_id, (subMap.get(s.creator_id) ?? 0) + 1)
    }
  }

  const postMap = aggregatePosts(posts ?? [])

  type RevAgg = { sub: number; ppv: number; tip: number }
  const revMap = new Map<string, RevAgg>()
  let totalSub = 0
  let totalPpv = 0
  let totalTip = 0
  for (const t of txs ?? []) {
    const amt = Number(t.amount_usd)
    if (!Number.isFinite(amt)) continue
    const cur = revMap.get(t.creator_id) ?? { sub: 0, ppv: 0, tip: 0 }
    if (t.type === 'subscription') { cur.sub += amt; totalSub += amt }
    else if (t.type === 'ppv')     { cur.ppv += amt; totalPpv += amt }
    else if (t.type === 'tip')     { cur.tip += amt; totalTip += amt }
    revMap.set(t.creator_id, cur)
  }

  const rows: CreatorStat[] = (creators ?? []).map((c) => {
    const postAgg = postMap.get(c.id) ?? { count: 0, last30: 0, firstAt: null, lastAt: null }
    const rev = revMap.get(c.id) ?? { sub: 0, ppv: 0, tip: 0 }
    const totalRev = rev.sub + rev.ppv + rev.tip

    const postsPerWeek = computePostsPerWeek(postAgg.count, postAgg.firstAt)

    return {
      id:                       c.id,
      username:                 c.username,
      display_name:             c.display_name,
      avatar_url:               c.avatar_url,
      status:                   c.creator_status as 'approved' | 'suspended',
      subscription_price_usd:   c.subscription_price_usd != null ? Number(c.subscription_price_usd) : null,
      followers:                subMap.get(c.id) ?? 0,
      posts_total:              postAgg.count,
      posts_last_30:            postAgg.last30,
      posts_per_week:           postsPerWeek,
      last_post_at:             postAgg.lastAt,
      revenue_subscription:     rev.sub,
      revenue_ppv:              rev.ppv,
      revenue_tip:              rev.tip,
      revenue_total:            totalRev,
    }
  })

  const totalRevenue = totalSub + totalPpv + totalTip
  const totalFollowers = rows.reduce((n, r) => n + r.followers, 0)
  const totalPosts = rows.reduce((n, r) => n + r.posts_total, 0)
  const activeCreators = rows.filter((r) => r.status === 'approved').length

  // Build the daily series (last 30 days). One zero-filled bucket per day so
  // the chart line is continuous even when there's no activity.
  const dailyBuckets = emptyDailyBuckets()
  const dayIndex = new Map(dailyBuckets.map((b, i) => [b.day, i]))
  const cutoffDay = dailyBuckets[0].day
  for (const t of txs ?? []) {
    const amt = Number(t.amount_usd)
    if (!Number.isFinite(amt)) continue
    const day = String(t.created_at).slice(0, 10)
    if (day < cutoffDay) continue
    const idx = dayIndex.get(day)
    if (idx === undefined) continue
    const b = dailyBuckets[idx]
    if (t.type === 'subscription') b.sub += amt
    else if (t.type === 'ppv')     b.ppv += amt
    else if (t.type === 'tip')     b.tip += amt
    b.total = b.sub + b.ppv + b.tip
  }

  const topEarners: TopCreator[] = [...rows]
    .sort((a, b) => b.revenue_total - a.revenue_total)
    .slice(0, TOP_CREATORS_COUNT)
    .filter((r) => r.revenue_total > 0)
    .map((r) => ({
      username:     r.username,
      display_name: r.display_name,
      total:        r.revenue_total,
      sub:          r.revenue_subscription,
      ppv:          r.revenue_ppv,
      tip:          r.revenue_tip,
    }))

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Creators</h1>
        <p className="text-sm text-text-secondary mt-1">
          Performance across {activeCreators} active creator{activeCreators !== 1 ? 's' : ''}
        </p>
      </div>

      <CreatorsTabs pendingCount={pendingCount ?? 0} stripePendingCount={stripePendingCount} />

      {/* Platform totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Total revenue" value={fmtMoney(totalRevenue)} />
        <SummaryCard label="Active subs" value={totalFollowers.toLocaleString()} />
        <SummaryCard label="Posts published" value={totalPosts.toLocaleString()} />
        <SummaryCard
          label="Revenue mix"
          value={
            totalRevenue > 0
              ? `${pct(totalSub / totalRevenue)} / ${pct(totalPpv / totalRevenue)} / ${pct(totalTip / totalRevenue)}`
              : '—'
          }
          hint="Subs / PPV / Tips"
        />
      </div>

      {/* Charts */}
      <div className="flex flex-col gap-4 mb-6">
        <RevenueOverTimeChart data={dailyBuckets} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopEarningCreatorsChart creators={topEarners} />
          <RevenueSourceBreakdown sub={totalSub} ppv={totalPpv} tip={totalTip} />
        </div>
      </div>

      <StatsTable
        rows={rows}
        totals={{
          revenue:   totalRevenue,
          revSub:    totalSub,
          revPpv:    totalPpv,
          revTip:    totalTip,
          followers: totalFollowers,
          posts:     totalPosts,
        }}
      />
    </>
  )
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  })
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '0%'
  return `${Math.round(n * 100)}%`
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-bg-card border border-border rounded-2xl p-4">
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className="text-xl font-bold text-text-primary mt-1.5">{value}</p>
      {hint && <p className="text-[11px] text-text-muted mt-1">{hint}</p>}
    </div>
  )
}
