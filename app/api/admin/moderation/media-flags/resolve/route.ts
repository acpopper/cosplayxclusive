import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (admin.error) return admin.error

  const { flagId } = await request.json() as { flagId: string }
  if (!flagId) return NextResponse.json({ error: 'flagId required' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('image_content_flags')
    .update({ resolved_at: new Date().toISOString(), resolved_by: admin.userId })
    .eq('id', flagId)
    .is('resolved_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
