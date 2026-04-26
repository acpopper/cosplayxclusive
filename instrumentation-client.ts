import posthog from 'posthog-js'
import { readConsent, CONSENT_EVENT, type ConsentState } from '@/lib/consent'

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_TOKEN!, {
  api_host: '/ingest',
  ui_host: 'https://us.posthog.com',
  defaults: '2026-01-30',
  capture_exceptions: true,
  // Off by default — only enable once the user accepts analytics cookies.
  opt_out_capturing_by_default: true,
  debug: process.env.NODE_ENV === 'development',
})

function applyConsent(state: ConsentState | null) {
  if (state?.analytics) {
    posthog.opt_in_capturing()
  } else {
    posthog.opt_out_capturing()
  }
}

// Apply any previously-stored choice on load.
applyConsent(readConsent())

// React to runtime updates from the cookie banner.
if (typeof window !== 'undefined') {
  window.addEventListener(CONSENT_EVENT, (e) => {
    const detail = (e as CustomEvent<ConsentState | null>).detail
    if (detail === null) return // re-open signal — no change yet.
    applyConsent(detail)
  })
}
