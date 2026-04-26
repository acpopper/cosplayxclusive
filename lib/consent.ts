// Cookie / analytics consent helper.
// Stored in localStorage so the banner state survives reloads. The "essential"
// category is always on (auth cookies); the "analytics" category gates PostHog
// and Google Analytics via the listeners in instrumentation-client.ts and the
// gtag consent-update call in the banner.

export const CONSENT_STORAGE_KEY = 'cxc_cookie_consent_v1'
export const CONSENT_EVENT = 'cxc:cookie-consent-changed'

export type ConsentChoice = 'all' | 'essential'

export interface ConsentState {
  choice:    ConsentChoice
  analytics: boolean
  updatedAt: string
}

export function readConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ConsentState>
    if (parsed.choice !== 'all' && parsed.choice !== 'essential') return null
    return {
      choice:    parsed.choice,
      analytics: parsed.choice === 'all',
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function writeConsent(choice: ConsentChoice): ConsentState {
  const state: ConsentState = {
    choice,
    analytics: choice === 'all',
    updatedAt: new Date().toISOString(),
  }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state))
    window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_EVENT, { detail: state }))
  }
  return state
}

export function clearConsent() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(CONSENT_STORAGE_KEY)
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null }))
}

// Re-opens the cookie banner without clearing the saved choice — the user
// may simply want to review or change their preference.
export function reopenConsentBanner() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null }))
}
