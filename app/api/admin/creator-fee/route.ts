import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// PATCH /api/admin/creator-fee
// Body: { creatorId: string; feePercent: number | null }
//   feePercent === null  → clear override, revert to DEFAULT_STRIPE_FEE
//   feePercent ∈ [0, 100] → set override
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const creatorId = body?.creatorId
  const feePercent = body?.feePercent

  if (!creatorId || typeof creatorId !== 'string') {
    return NextResponse.json({ error: 'Missing creatorId' }, { status: 400 })
  }

  let value: number | null
  if (feePercent === null || feePercent === undefined || feePercent === '') {
    value = null
  } else {
    const n = Number(feePercent)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: 'Fee must be between 0 and 100' }, { status: 400 })
    }
    value = Number(n.toFixed(2))
  }

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({ platform_fee_percent: value })
    .eq('id', creatorId)
    .not('creator_status', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, platform_fee_percent: value })
}
