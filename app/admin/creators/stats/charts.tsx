// Lightweight SVG charts for the admin stats page. No external dep — these
// render fully server-side and stay readable at the table's column widths.

export interface RevenueByDay {
  day:   string  // 'YYYY-MM-DD'
  sub:   number
  ppv:   number
  tip:   number
  total: number
}

export interface TopCreator {
  username:     string
  display_name: string | null
  total:        number
  sub:          number
  ppv:          number
  tip:          number
}

function fmtMoney(n: number): string {
  if (n === 0) return '$0'
  return n.toLocaleString('en-US', {
    style:                'currency',
    currency:             'USD',
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  })
}

// ─── Stacked area chart: revenue by day, by source ──────────────────────────
export function RevenueOverTimeChart({ data }: { data: RevenueByDay[] }) {
  if (data.length === 0 || data.every((d) => d.total === 0)) {
    return (
      <div className="bg-bg-card border border-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-1">Revenue progression</h2>
        <p className="text-xs text-text-muted">No transactions in the window yet.</p>
      </div>
    )
  }

  const W = 600
  const H = 180
  const padding = { top: 12, right: 8, bottom: 22, left: 44 }
  const plotW = W - padding.left - padding.right
  const plotH = H - padding.top  - padding.bottom

  const maxStack = Math.max(...data.map((d) => d.total), 1)
  const stepX    = data.length > 1 ? plotW / (data.length - 1) : 0

  // Stacked y-coordinates for sub / sub+ppv / sub+ppv+tip
  function y(value: number): number {
    return padding.top + plotH - (value / maxStack) * plotH
  }

  function pathFor(getValue: (d: RevenueByDay) => number, getBase: (d: RevenueByDay) => number): string {
    // Walk forward along the top line, then back along the base.
    const top    = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${padding.left + i * stepX} ${y(getValue(d))}`).join(' ')
    const bottom = data
      .slice()
      .reverse()
      .map((d, j) => {
        const i = data.length - 1 - j
        return `L ${padding.left + i * stepX} ${y(getBase(d))}`
      })
      .join(' ')
    return `${top} ${bottom} Z`
  }

  // y-axis ticks (3 lines)
  const ticks = [0, maxStack / 2, maxStack]

  // x-axis labels: first, middle, last day for compactness
  const xLabelIdxs = data.length <= 3
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 2), data.length - 1]

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-semibold text-text-primary">Revenue progression</h2>
        <p className="text-[11px] text-text-muted">
          Last {data.length} {data.length === 1 ? 'day' : 'days'} · Stacked: Subs · PPV · Tips
        </p>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-44 mt-3"
        role="img"
        aria-label="Stacked revenue per day by source"
      >
        {/* gridlines + axis labels */}
        {ticks.map((v, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={W - padding.right}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              className="text-border"
              strokeDasharray={i === 0 ? '0' : '2 3'}
            />
            <text
              x={padding.left - 6}
              y={y(v) + 3}
              textAnchor="end"
              className="fill-text-muted"
              fontSize="9"
            >
              {fmtMoney(v)}
            </text>
          </g>
        ))}

        {/* Stacked areas (Subs base, PPV middle, Tips top) */}
        <path
          d={pathFor((d) => d.sub, () => 0)}
          className="fill-accent/40"
        />
        <path
          d={pathFor((d) => d.sub + d.ppv, (d) => d.sub)}
          className="fill-success/40"
        />
        <path
          d={pathFor((d) => d.sub + d.ppv + d.tip, (d) => d.sub + d.ppv)}
          className="fill-warning/40"
        />

        {/* Top stroke for emphasis */}
        <path
          d={data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${padding.left + i * stepX} ${y(d.total)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-text-secondary"
        />

        {/* x-axis labels */}
        {xLabelIdxs.map((i) => (
          <text
            key={i}
            x={padding.left + i * stepX}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
            className="fill-text-muted"
            fontSize="9"
          >
            {data[i].day.slice(5)}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-2 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-accent/60" /> Subs
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-success/60" /> PPV
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-warning/60" /> Tips
        </span>
      </div>
    </div>
  )
}

// ─── Horizontal bar chart: top earning creators ─────────────────────────────
export function TopEarningCreatorsChart({ creators }: { creators: TopCreator[] }) {
  if (creators.length === 0) {
    return null
  }

  const max = Math.max(...creators.map((c) => c.total), 1)

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-1">Top earning creators</h2>
      <p className="text-[11px] text-text-muted mb-4">
        Lifetime creator-cut revenue. Hover a row to see the source mix.
      </p>

      <div className="flex flex-col gap-2.5">
        {creators.map((c) => {
          const subPct = c.total > 0 ? (c.sub / c.total) * 100 : 0
          const ppvPct = c.total > 0 ? (c.ppv / c.total) * 100 : 0
          const tipPct = c.total > 0 ? (c.tip / c.total) * 100 : 0
          const width  = (c.total / max) * 100
          return (
            <div
              key={c.username}
              className="flex items-center gap-3"
              title={`Subs ${fmtMoney(c.sub)} · PPV ${fmtMoney(c.ppv)} · Tips ${fmtMoney(c.tip)}`}
            >
              <p className="text-xs text-text-primary truncate w-32 flex-shrink-0">
                {c.display_name || c.username}
              </p>
              <div className="flex-1 h-3 rounded-full bg-bg-elevated overflow-hidden">
                <div
                  className="h-full flex"
                  style={{ width: `${width}%` }}
                >
                  <div className="h-full bg-accent" style={{ width: `${subPct}%` }} />
                  <div className="h-full bg-success" style={{ width: `${ppvPct}%` }} />
                  <div className="h-full bg-warning" style={{ width: `${tipPct}%` }} />
                </div>
              </div>
              <p className="text-xs font-semibold text-text-primary text-right tabular-nums w-20 flex-shrink-0">
                {fmtMoney(c.total)}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Donut-ish horizontal split: platform-wide revenue source breakdown ─────
export function RevenueSourceBreakdown({
  sub,
  ppv,
  tip,
}: {
  sub: number
  ppv: number
  tip: number
}) {
  const total = sub + ppv + tip
  if (total <= 0) {
    return null
  }
  const subPct = (sub / total) * 100
  const ppvPct = (ppv / total) * 100
  const tipPct = (tip / total) * 100

  return (
    <div className="bg-bg-card border border-border rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-1">Revenue by source</h2>
      <p className="text-[11px] text-text-muted mb-3">Platform-wide creator-cut totals.</p>

      <div className="h-3 rounded-full bg-bg-elevated overflow-hidden flex">
        <div className="h-full bg-accent"  style={{ width: `${subPct}%` }} />
        <div className="h-full bg-success" style={{ width: `${ppvPct}%` }} />
        <div className="h-full bg-warning" style={{ width: `${tipPct}%` }} />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-3">
        <SourceCard color="bg-accent"  label="Subscriptions" amount={sub} pct={subPct} />
        <SourceCard color="bg-success" label="PPV"           amount={ppv} pct={ppvPct} />
        <SourceCard color="bg-warning" label="Tips"          amount={tip} pct={tipPct} />
      </div>
    </div>
  )
}

function SourceCard({ color, label, amount, pct }: {
  color:  string
  label:  string
  amount: number
  pct:    number
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <span className={`inline-block h-2 w-2 rounded-sm ${color}`} />
        {label}
      </div>
      <p className="text-sm font-semibold text-text-primary mt-1 tabular-nums">{fmtMoney(amount)}</p>
      <p className="text-[10px] text-text-muted tabular-nums">{Math.round(pct)}% of total</p>
    </div>
  )
}
