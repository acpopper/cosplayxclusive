import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'

// Standard accounts get the full Stripe Dashboard at https://dashboard.stripe.com.
// We still expose a "Manage" endpoint that returns a fresh account link the
// connected account can use to update their account details / banking info.
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_account_id, creator_status')
      .eq('id', user.id)
      .single()

    if (!profile?.stripe_account_id) {
      return NextResponse.json({ error: 'No Stripe account' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // For Standard accounts, the canonical destination is dashboard.stripe.com
    // (creators log in with their own Stripe credentials). We still return an
    // account-update link so partially-onboarded creators can resume onboarding.
    const link = await getStripe().accountLinks.create({
      account: profile.stripe_account_id,
      refresh_url: `${appUrl}/dashboard/connect`,
      return_url: `${appUrl}/dashboard/connect`,
      type: 'account_update',
    })

    return NextResponse.json({ url: link.url })
  } catch (err) {
    console.error('[connect/dashboard]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    )
  }
}
