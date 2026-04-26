'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { readConsent, writeConsent, CONSENT_EVENT, type ConsentChoice } from '@/lib/consent'

// Update Google Consent Mode v2 + opt PostHog in/out based on user choice.
// Both calls are no-ops if their respective scripts haven't loaded yet —
// the gtag default is set in app/layout.tsx before this runs, and the
// posthog listener in instrumentation-client.ts catches up via the event.
function applyChoice(choice: ConsentChoice) {
  const granted = choice === 'all'
  const gw = window as unknown as { gtag?: (...args: unknown[]) => void }
  if (typeof gw.gtag === 'function') {
    gw.gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage:        'denied',
      ad_user_data:      'denied',
      ad_personalization:'denied',
    })
  }
}

export function CookieBanner() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Defer the initial-open check so we don't setState synchronously inside
    // the effect body (which would be flagged by react-hooks/set-state-in-effect).
    const t = window.setTimeout(() => {
      if (!readConsent()) setOpen(true)
    }, 0)
    function onCustom(e: Event) {
      const detail = (e as CustomEvent).detail
      // Banner re-opened from footer "Cookie preferences" → detail === null.
      if (detail === null) setOpen(true)
    }
    window.addEventListener(CONSENT_EVENT, onCustom)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener(CONSENT_EVENT, onCustom)
    }
  }, [])

  function choose(choice: ConsentChoice) {
    writeConsent(choice)
    applyChoice(choice)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[1000] px-3 pb-3 sm:px-4 sm:pb-4 pointer-events-none"
    >
      <div className="mx-auto max-w-3xl pointer-events-auto rounded-2xl border border-border bg-bg-card/95 backdrop-blur-md shadow-2xl">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary mb-1">We use cookies</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              We use essential cookies to keep you signed in and analytics cookies to understand
              how the platform is used. You can accept all or stick to essential only.{' '}
              <Link href="/cookies" className="text-accent hover:underline">
                Learn more
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:flex-shrink-0">
            <button
              type="button"
              onClick={() => choose('essential')}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              Essential only
            </button>
            <button
              type="button"
              onClick={() => choose('all')}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
