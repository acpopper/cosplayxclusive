import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch current profile to guard against double-apply
  const { data: profile } = await supabase
    .from('profiles')
    .select('creator_status')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Only allow application if not already pending or approved
  if (profile.creator_status === 'pending' || profile.creator_status === 'approved') {
    return NextResponse.json({ error: 'Application already submitted or already a creator' }, { status: 400 })
  }

  const body = await request.json() as {
    displayName?: string
    bio?: string | null
    application: string
    subscriptionPrice: number
  }

  if (!body.application?.trim()) {
    return NextResponse.json({ error: 'Application text is required' }, { status: 400 })
  }

  const price = Number(body.subscriptionPrice)
  if (isNaN(price) || price < 0) {
    return NextResponse.json({ error: 'Invalid subscription price' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({
      display_name: body.displayName || null,
      bio: body.bio || null,
      creator_status: 'pending',
      creator_application: body.application,
      creator_applied_at: new Date().toISOString(),
      subscription_price_usd: price,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
