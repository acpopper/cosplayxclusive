'use client'

import { reopenConsentBanner } from '@/lib/consent'

export function CookiePreferencesButton({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <button type="button" onClick={reopenConsentBanner} className={className}>
      {children}
    </button>
  )
}
