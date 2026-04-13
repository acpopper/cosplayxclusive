import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { creatorId } = await request.json()
  if (!creatorId) return NextResponse.json({ error: 'Missing creatorId' }, { status: 400 })

  // Fetch the subscription record
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, stripe_subscription_id, status')
    .eq('fan_id', user.id)
    .eq('creator_id', creatorId)
    .eq('status', 'active')
    .single()

  if (!sub) return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })

  const service = createServiceClient()

  // ── Free subscription (no Stripe) ─────────────────────────────────────────
  if (!sub.stripe_subscription_id) {
    const { error } = await service
      .from('subscriptions')
      .delete()
      .eq('id', sub.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── Paid subscription — cancel via Stripe ──────────────────────────────────
  // We need the creator's stripe_account_id to cancel on the connected account
  const { data: creator } = await supabase
    .from('profiles')
    .select('stripe_account_id')
    .eq('id', creatorId)
    .single()

  if (!creator?.stripe_account_id) {
    return NextResponse.json({ error: 'Creator Stripe account not found' }, { status: 500 })
  }

  try {
    await getStripe().subscriptions.cancel(
      sub.stripe_subscription_id,
      {},
      { stripeAccount: creator.stripe_account_id }
    )
  } catch (err) {
    console.error('[subscriptions/cancel] Stripe error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Stripe cancellation failed' },
      { status: 500 }
    )
  }

  // Optimistically update DB — the webhook will also fire and confirm this
  await service
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', sub.id)

  return NextResponse.json({ ok: true })
}
