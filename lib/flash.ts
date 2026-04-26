/**
 * Cross-navigation flash messages, surfaced by <FlashToast /> mounted in the
 * root layout. Call setFlash(...) right before router.push() / navigation and
 * the destination page will show the toast on mount.
 */

const STORAGE_KEY = 'flash'
const EVENT_NAME  = 'flash:set'

export type FlashTone = 'success' | 'error' | 'info'

export interface FlashPayload {
  message: string
  tone?:   FlashTone
}

export function setFlash(message: string, tone: FlashTone = 'success') {
  if (typeof window === 'undefined') return
  const payload: FlashPayload = { message, tone }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  window.dispatchEvent(new CustomEvent<FlashPayload>(EVENT_NAME, { detail: payload }))
}

export function readFlash(): FlashPayload | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  sessionStorage.removeItem(STORAGE_KEY)
  try {
    return JSON.parse(raw) as FlashPayload
  } catch {
    return null
  }
}

export const FLASH_EVENT = EVENT_NAME
