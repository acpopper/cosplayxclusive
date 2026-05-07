import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'

// Resend uses Svix to deliver webhooks. Each request carries:
//   svix-id         — unique message id
//   svix-timestamp  — unix seconds (used for replay protection)
//   svix-signature  — space-separated `v1,<base64sig> v1,<base64sig>` list
//                     (multiple sigs during secret rotation; any one valid is OK)
// The signed payload is `${id}.${timestamp}.${rawBody}` and the secret is the
// base64-encoded value following the `whsec_` prefix.

const REPLAY_WINDOW_SECONDS = 5 * 60

function verifySignature(
  secret:    string,
  id:        string,
  timestamp: string,
  signatureHeader: string,
  rawBody:   string,
): boolean {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signed      = `${id}.${timestamp}.${rawBody}`
  const expected    = crypto.createHmac('sha256', secretBytes).update(signed).digest('base64')

  const candidates = signatureHeader
    .split(' ')
    .map((s) => s.split(',')[1])
    .filter(Boolean)

  for (const sig of candidates) {
    try {
      const a = Buffer.from(sig,      'base64')
      const b = Buffer.from(expected, 'base64')
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
    } catch { /* ignore malformed entry */ }
  }
  return false
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }

  const id        = request.headers.get('svix-id')
  const timestamp = request.headers.get('svix-timestamp')
  const signature = request.headers.get('svix-signature')
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  // Replay protection — reject anything older than 5 minutes
  const ts = parseInt(timestamp, 10)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > REPLAY_WINDOW_SECONDS) {
    return NextResponse.json({ error: 'Stale timestamp' }, { status: 400 })
  }

  const rawBody = await request.text()

  if (!verifySignature(secret, id, timestamp, signature, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: { type?: string; data?: { email?: string; to?: string | string[]; bounce?: { message?: string } } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Resend event types we care about: 'email.bounced' and 'email.complained'.
  // The payload's `to` may be a string or array depending on the API call.
  const reason: 'bounce' | 'complaint' | null =
    event.type === 'email.bounced'    ? 'bounce'    :
    event.type === 'email.complained' ? 'complaint' :
    null

  if (!reason) {
    return NextResponse.json({ ok: true, ignored: event.type })
  }

  const rawTo = event.data?.to
  const recipients = Array.isArray(rawTo) ? rawTo : rawTo ? [rawTo] : event.data?.email ? [event.data.email] : []
  const detail = event.data?.bounce?.message ?? null

  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, ignored: 'no recipients in payload' })
  }

  const service = createServiceClient()
  const rows = recipients.map((email) => ({
    email:  email.toLowerCase().trim(),
    reason,
    detail,
  }))

  const { error } = await service
    .from('email_suppressions')
    .upsert(rows, { onConflict: 'email' })

  if (error) {
    console.error('[resend-webhook] suppression upsert failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, suppressed: rows.length })
}
