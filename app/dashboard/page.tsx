import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: posts }, { data: transactions }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('posts').select('id, access_type').eq('creator_id', user.id),
    supabase
      .from('transactions')
      .select('amount_usd, type, created_at')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  const totalEarnings = transactions?.reduce((sum, t) => sum + (t.amount_usd || 0), 0) || 0
  const monthlyEarnings = transactions
    ?.filter((t) => {
      const d = new Date(t.created_at)
      const now = new Date()
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((sum, t) => sum + (t.amount_usd || 0), 0) || 0

  const isApproved = profile?.creator_status === 'approved'
  const isPending = profile?.creator_status === 'pending'

  return (
    <div className="flex flex-col gap-6">
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

      {/* Status alerts */}
      {isPending && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
          <p className="text-sm font-medium text-warning">Account pending approval</p>
          <p className="text-xs text-text-muted mt-1">
            Your creator account is under review. You&apos;ll be notified when it&apos;s approved.
          </p>
        </div>
      )}

      {profile?.creator_status === 'rejected' && (
        <div className="rounded-xl border border-error/20 bg-error/5 p-4">
          <p className="text-sm font-medium text-error">Application not approved</p>
          <p className="text-xs text-text-muted mt-1">
            Contact support if you believe this is a mistake.
          </p>
        </div>
      )}

      {isApproved && !profile?.stripe_account_id && (
        <div className="rounded-xl border border-accent/20 bg-accent-muted p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-primary">Connect your payout account</p>
            <p className="text-xs text-text-muted mt-0.5">
              Set up Stripe to receive earnings from subscriptions and PPV.
            </p>
          </div>
          <Link href="/dashboard/connect">
            <Button size="sm">Connect →</Button>
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Total posts" value={String(posts?.length || 0)} />
        <StatCard
          label="This month"
          value={`$${monthlyEarnings.toFixed(2)}`}
          accent
        />
        <StatCard
          label="All time"
          value={`$${totalEarnings.toFixed(2)}`}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Recent transactions */}
      {transactions && transactions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-text-secondary mb-3">Recent Transactions</h2>
          <div className="bg-bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            {transactions.slice(0, 10).map((t, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant={t.type === 'subscription' ? 'accent' : 'warning'} className="text-xs capitalize">
                    {t.type}
                  </Badge>
                  <span className="text-xs text-text-muted">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </div>
                <span className="text-sm font-semibold text-success">
                  +${t.amount_usd.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      {isApproved && (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/dashboard/posts/new">
            <div className="bg-bg-card border border-border rounded-2xl p-4 hover:border-accent/30 transition-all cursor-pointer group">
              <div className="text-2xl mb-2">📸</div>
              <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                Create Post
              </p>
              <p className="text-xs text-text-muted mt-0.5">Share photos with fans</p>
            </div>
          </Link>
          <Link href="/dashboard/profile">
            <div className="bg-bg-card border border-border rounded-2xl p-4 hover:border-accent/30 transition-all cursor-pointer group">
              <div className="text-2xl mb-2">✏️</div>
              <p className="text-sm font-semibold text-text-primary group-hover:text-accent transition-colors">
                Edit Profile
              </p>
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
  className = '',
}: {
  label: string
  value: string
  accent?: boolean
  className?: string
}) {
  return (
    <div
      className={[
        'bg-bg-card border rounded-2xl p-4',
        accent ? 'border-accent/20 bg-accent-muted' : 'border-border',
        className,
      ].join(' ')}
    >
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className={['text-xl font-bold', accent ? 'text-accent' : 'text-text-primary'].join(' ')}>
        {value}
      </p>
    </div>
  )
}
