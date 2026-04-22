import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Returns { userId } if the caller is an admin, otherwise a NextResponse to return. */
export async function requireAdmin(): Promise<
  | { userId: string; error?: undefined }
  | { error: NextResponse; userId?: undefined }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id }
}
