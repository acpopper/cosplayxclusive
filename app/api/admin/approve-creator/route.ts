import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { sendCreatorApproved, sendCreatorRejected } from '@/lib/email'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify caller is admin
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { creatorId, action } = await request.json()

  if (!creatorId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const { error } = await serviceClient
    .from('profiles')
    .update({ creator_status: action === 'approve' ? 'approved' : 'rejected' })
    .eq('id', creatorId)
    .not('creator_status', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Send email notification to creator (best-effort)
  const { data: { user: creatorUser } } = await serviceClient.auth.admin.getUserById(creatorId)
  if (creatorUser?.email) {
    const { data: creatorProfile } = await serviceClient
      .from('profiles')
      .select('username')
      .eq('id', creatorId)
      .single()

    const username = creatorProfile?.username ?? creatorUser.email
    if (action === 'approve') {
      await sendCreatorApproved(creatorUser.email, username)
    } else {
      await sendCreatorRejected(creatorUser.email, username)
    }
  }

  return NextResponse.json({ ok: true })
}
