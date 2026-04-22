import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Base data ──────────────────────────────────────────────────────────────
  const [{ data: profile }, { data: posts }, { data: transactions }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('posts').select('id, caption, access_type, preview_paths, published_at').eq('creator_id', user.id).order('published_at', { ascending: false }),
    supabase.from('transactions').select('amount_usd, type, created_at').eq('creator_id', user.id).order('created_at', { ascending: false }),
  ])

  const postIds = (posts ?? []).map((p) => p.id)

  // ── Enrichment queries (only if posts exist) ────────────────────────────────
  const [likesRes, commentsRes, tipsRes, subsRes] = await Promise.all([
    postIds.length
      ? supabase.from('post_likes').select('post_id').in('post_id', postIds)
      : Promise.resolve({ data: [] }),
    postIds.length
      ? supabase
          .from('post_comments')
          .select(`id, post_id, body, created_at, profile:profiles!user_id ( username, display_name, avatar_url )`)
          .in('post_id', postIds)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    postIds.length
      ? supabase
          .from('post_tips')
          .select(`id, post_id, amount_usd, created_at, fan:profiles!fan_id ( username, display_name, avatar_url )`)
          .in('post_id', postIds)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] }),
    supabase
      .from('subscriptions')
      .select('id', { count: 'exact', head: false })
      .eq('creator_id', user.id)
      .eq('status', 'active'),
  ])

  const allLikes = likesRes.data ?? []
  const allComments = commentsRes.data ?? []
  const allTips = tipsRes.data ?? []
  const activeSubscribers = subsRes.data?.length ?? 0

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const totalEarnings = (transactions ?? []).reduce((s, t) => s + (t.amount_usd || 0), 0)
  const monthlyEarnings = (transactions ?? [])
    .filter((t) => {
      const d = new Date(t.created_at)
      const now = new Date()
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((s, t) => s + (t.amount_usd || 0), 0)

  const lifetimeLikes = allLikes.length
  const lifetimeTips = (allTips as { amount_usd: number }[]).reduce((s, t) => s + Number(t.amount_usd), 0)

  // Like counts per post
  const likeCountMap: Record<string, number> = {}
  for (const l of allLikes) {
    const id = (l as { post_id: string }).post_id
    likeCountMap[id] = (likeCountMap[id] ?? 0) + 1
  }

  // Top 3 posts by likes
  const topPosts = [...(posts ?? [])]
    .map((p) => ({ ...p, likes: likeCountMap[p.id] ?? 0 }))
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 3)
    .filter((p) => p.likes > 0)

  const isApproved = profile?.creator_status === 'approved'
  const isPending = profile?.creator_status === 'pending'

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Welcome back, {profile?.display_name || profile?.username}
          </p>
        </div>
        {isApproved && (
          <Link href="/dashboard/posts/new">
            <Button size="md">+ New Post</Button>
          </Link>
        )}
      </div>

      {/* ── Status alerts ───────────────────────────────────────────────────── */}
      {isPending && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">⏳ Application under review</p>
          <p className="text-xs text-text-muted mt-1">Our team is reviewing your application. We&apos;ll reach out via messages — usually within a few business days.</p>
        </div>
      )}
      {profile?.creator_status === 'rejected' && (
        <div className="rounded-xl border border-error/20 bg-error/5 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-error">Application not approved</p>
            <p className="text-xs text-text-muted mt-1">Check your messages for feedback from our team, then reapply when ready.</p>
          </div>
          <Link href="/settings/creator-apply">
            <Button size="sm" variant="secondary">Reapply</Button>
          </Link>
        </div>
      )}
      {isApproved && !profile?.stripe_account_id && (
        <div className="rounded-xl border border-accent/20 bg-accent-muted p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">Connect your payout account</p>
            <p className="text-xs text-text-muted mt-0.5">Set up Stripe to receive earnings.</p>
          </div>
          <Link href="/dashboard/connect"><Button size="sm">Connect →</Button></Link>
        </div>
      )}

      {/* ── Stats grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total posts"     value={String(posts?.length || 0)} />
        <StatCard label="Active fans"     value={String(activeSubscribers)}  />
        <StatCard label="This month"      value={`$${monthlyEarnings.toFixed(2)}`} accent className="col-span-2 sm:col-span-1" />
        <StatCard label="All-time revenue" value={`$${totalEarnings.toFixed(2)}`} />
        <StatCard label="Lifetime likes"  value={String(lifetimeLikes)} icon="♥" />
        <StatCard label="Lifetime tips"   value={`$${lifetimeTips.toFixed(2)}`} icon="💰" />
      </div>

      {/* ── Top posts ───────────────────────────────────────────────────────── */}
      {topPosts.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary mb-3">🏆 Top Posts by Likes</h2>
          <div className="bg-bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
            {topPosts.map((p, idx) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-lg w-6 text-center flex-shrink-0">
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                </span>
                <div className="h-10 w-10 rounded-lg overflow-hidden bg-bg-elevated flex-shrink-0">
                  {p.preview_paths?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${p.preview_paths[0]}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-text-muted text-xs">📷</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{p.caption || <span className="italic text-text-muted">No caption</span>}</p>
                  <p className="text-xs text-text-muted">{new Date(p.published_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-1 text-accent text-sm font-semibold flex-shrink-0">
                  <span>♥</span>
                  <span>{p.likes}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Two column: latest comments + latest tips ────────────────────────── */}
      {(allComments.length > 0 || allTips.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Latest comments */}
          {allComments.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-secondary mb-3">💬 Latest Comments</h2>
              <div className="bg-bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {(allComments as unknown as {
                  id: string
                  post_id: string
                  body: string
                  created_at: string
                  profile: { username: string; display_name: string | null; avatar_url: string | null } | { username: string; display_name: string | null; avatar_url: string | null }[] | null
                }[]).map((c) => {
                  const profRaw = c.profile
                  const prof = (Array.isArray(profRaw) ? profRaw[0] : profRaw) as { username: string; display_name: string | null; avatar_url: string | null } | null
                  const initials = (prof?.display_name || prof?.username || '?')[0].toUpperCase()
                  return (
                    <div key={c.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="h-7 w-7 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0 mt-0.5">
                        {prof?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={prof.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                            <span className="text-[9px] font-bold text-white">{initials}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-text-primary truncate">{prof?.display_name || prof?.username}</p>
                        <p className="text-xs text-text-secondary truncate mt-0.5">{c.body}</p>
                        <p className="text-[10px] text-text-muted mt-0.5">{new Date(c.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Latest tips */}
          {allTips.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-text-secondary mb-3">💰 Latest Tips</h2>
              <div className="bg-bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {(allTips as unknown as {
                  id: string
                  post_id: string
                  amount_usd: number
                  created_at: string
                  fan: { username: string; display_name: string | null; avatar_url: string | null } | { username: string; display_name: string | null; avatar_url: string | null }[] | null
                }[]).map((t) => {
                  const fanRaw = t.fan
                  const fan = (Array.isArray(fanRaw) ? fanRaw[0] : fanRaw) as { username: string; display_name: string | null; avatar_url: string | null } | null
                  const initials = (fan?.display_name || fan?.username || '?')[0].toUpperCase()
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-7 w-7 rounded-full overflow-hidden bg-bg-elevated flex-shrink-0">
                        {fan?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fan.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-accent to-accent-alt">
                            <span className="text-[9px] font-bold text-white">{initials}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-text-primary">{fan?.display_name || fan?.username}</p>
                        <p className="text-[10px] text-text-muted">{new Date(t.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className="text-sm font-bold text-yellow-400 flex-shrink-0">+${Number(t.amount_usd).toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Recent transactions ──────────────────────────────────────────────── */}
      {transactions && transactions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-secondary mb-3">Recent Transactions</h2>
          <div className="bg-bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            {transactions.slice(0, 8).map((t, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant={t.type === 'subscription' ? 'accent' : 'warning'} className="text-xs capitalize">
                    {t.type}
                  </Badge>
                  <span className="text-xs text-text-muted">{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
                <span className="text-sm font-semibold text-success">+${t.amount_usd.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Quick actions ────────────────────────────────────────────────────── */}
      {isApproved && (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/posts/new">
            <div className="bg-bg-card border border-border rounded-2xl p-4 hover:border-accent/30 transition-all cursor-pointer group">
              <div className="text-2xl mb-2">📸</div>
              <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">Create Post</p>
              <p className="text-xs text-text-muted mt-0.5">Share photos with fans</p>
            </div>
          </Link>
          <Link href="/dashboard/profile">
            <div className="bg-bg-card border border-border rounded-2xl p-4 hover:border-accent/30 transition-all cursor-pointer group">
              <div className="text-2xl mb-2">✏️</div>
              <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">Edit Profile</p>
              <p className="text-xs text-text-muted mt-0.5">Update your page</p>
            </div>
          </Link>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  icon,
  className = '',
}: {
  label: string
  value: string
  accent?: boolean
  icon?: string
  className?: string
}) {
  return (
    <div className={['bg-bg-card border rounded-2xl p-4', accent ? 'border-accent/20 bg-accent-muted' : 'border-border', className].join(' ')}>
      <p className="text-xs text-text-muted mb-1 flex items-center gap-1">
        {icon && <span>{icon}</span>}
        {label}
      </p>
      <p className={['text-xl font-bold', accent ? 'text-accent' : 'text-text-primary'].join(' ')}>
        {value}
      </p>
    </div>
  )
}
