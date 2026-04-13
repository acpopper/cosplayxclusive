import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
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

  const { creatorId, action } = await request.json()

  if (!creatorId || !['suspend', 'unsuspend', 'delete'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const serviceClient = createServiceClient()

  if (action === 'delete') {
    // Delete profile first (cascades to posts, subscriptions, etc.)
    const { error: profileError } = await serviceClient
      .from('profiles')
      .delete()
      .eq('id', creatorId)

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    // Then delete the auth user
    const { error: authError } = await serviceClient.auth.admin.deleteUser(creatorId)
    if (authError) {
      // Profile is already gone; log but don't fail the request
      console.error('Failed to delete auth user:', authError.message)
    }

    return NextResponse.json({ ok: true })
  }

  const newStatus = action === 'suspend' ? 'suspended' : 'approved'

  const { error } = await serviceClient
    .from('profiles')
    .update({ creator_status: newStatus })
    .eq('id', creatorId)
    .eq('role', 'creator')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
