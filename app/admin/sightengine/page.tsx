import { createClient } from '@/lib/supabase/server'

interface DailyBucket {
  day:       string
  total:     number
  succeeded: number
  flagged:   number
}

interface SourceBucket {
  source: string
  total:  number
}

interface TopUserBucket {
  user_id:       string | null
  username:      string | null
  display_name:  string | null
  total:         number
}

const DAYS = 30

export default async function AdminSightenginePage() {
  // Layout already enforces admin role. We can safely service-query without
  // re-checking RLS here.
  const supabase = await createClient()

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Pull up to 5k recent rows — sightengine is one call per image so this is
  // a fine cap for a month of activity at our current volume. If we ever
  // exceed it, the buckets below get truncated and the admin sees a hint to
  // tighten the window.
  const { data: rows } = await supabase
    .from('sightengine_usage')
    .select('user_id, source, succeeded, flagged, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5000)

  const safeRows = rows ?? []

  // ── Daily buckets ─────────────────────────────────────────────────────────
  const dayMap = new Map<string, DailyBucket>()
  for (const r of safeRows) {
    const day = r.created_at.slice(0, 10)
    const b   = dayMap.get(day) ?? { day, total: 0, succeeded: 0, flagged: 0 }
    b.total     += 1
    b.succeeded += r.succeeded ? 1 : 0
    b.flagged   += r.flagged   ? 1 : 0
    dayMap.set(day, b)
  }
  const daily = Array.from(dayMap.values()).sort((a, b) => b.day.localeCompare(a.day))

  // ── Source breakdown ──────────────────────────────────────────────────────
  const sourceMap = new Map<string, number>()
  for (const r of safeRows) sourceMap.set(r.source, (sourceMap.get(r.source) ?? 0) + 1)
  const sources: SourceBucket[] = Array.from(sourceMap, ([source, total]) => ({ source, total }))
    .sort((a, b) => b.total - a.total)

  // ── Top users ─────────────────────────────────────────────────────────────
  const userMap = new Map<string, number>()
  for (const r of safeRows) {
    if (!r.user_id) continue
    userMap.set(r.user_id, (userMap.get(r.user_id) ?? 0) + 1)
  }
  const topUserIds = Array.from(userMap, ([id, total]) => ({ id, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  let topUsers: TopUserBucket[] = []
  if (topUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .in('id', topUserIds.map((u) => u.id))
    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
    topUsers = topUserIds.map(({ id, total }) => {
      const p = profileMap.get(id)
      return {
        user_id:      id,
        username:     p?.username     ?? null,
        display_name: p?.display_name ?? null,
        total,
      }
    })
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const total       = safeRows.length
  const succeeded   = safeRows.filter((r) => r.succeeded).length
  const flagged     = safeRows.filter((r) => r.flagged).length
  const failureRate = total > 0 ? Math.round(((total - succeeded) / total) * 100) : 0
  const truncated   = safeRows.length >= 5000

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Sightengine usage</h1>
        <p className="text-sm text-text-secondary mt-1">
          Image moderation API calls — one row per image. Last {DAYS} days{truncated && ', capped at 5000 rows'}.
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total calls"    value={String(total)} />
        <StatCard label="Succeeded"      value={String(succeeded)} />
        <StatCard label="Flagged"        value={String(flagged)} />
        <StatCard label="Failure rate"   value={`${failureRate}%`} accent={failureRate > 10} />
      </div>

      {/* By source */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary mb-3">By source</h2>
        <div className="bg-bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {sources.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted text-center">No activity in this window.</p>
          ) : (
            sources.map(({ source, total }) => (
              <div key={source} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-text-primary font-medium">{source}</span>
                <span className="text-text-secondary">{total}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Daily activity */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Daily activity</h2>
        <div className="bg-bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {daily.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted text-center">No activity in this window.</p>
          ) : (
            daily.map(({ day, total, succeeded, flagged }) => (
              <div key={day} className="grid grid-cols-4 gap-2 px-4 py-2.5 text-xs">
                <span className="text-text-primary font-medium">{day}</span>
                <span className="text-text-secondary text-right">{total} calls</span>
                <span className="text-text-secondary text-right">{succeeded} ok</span>
                <span className="text-warning text-right">{flagged} flagged</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Top users */}
      <section>
        <h2 className="text-sm font-semibold text-text-secondary mb-3">Top users by call volume</h2>
        <div className="bg-bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          {topUsers.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted text-center">No identified users in this window.</p>
          ) : (
            topUsers.map((u) => (
              <div key={u.user_id ?? 'unknown'} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="text-text-primary font-medium truncate">
                    {u.display_name || u.username || 'Unknown user'}
                  </p>
                  {u.username && <p className="text-text-muted text-xs">@{u.username}</p>}
                </div>
                <span className="text-text-secondary">{u.total} calls</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={[
        'rounded-2xl border p-4',
        accent ? 'border-warning/30 bg-warning/5' : 'border-border bg-bg-card',
      ].join(' ')}
    >
      <p className="text-xs text-text-muted">{label}</p>
      <p className={['text-xl font-bold mt-1', accent ? 'text-warning' : 'text-text-primary'].join(' ')}>
        {value}
      </p>
    </div>
  )
}
