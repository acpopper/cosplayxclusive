'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { readFlash, FLASH_EVENT, type FlashPayload } from '@/lib/flash'

const TONE_CLASSES: Record<NonNullable<FlashPayload['tone']>, string> = {
  success: 'bg-success/15 border-success/30 text-success',
  error:   'bg-error/15 border-error/30 text-error',
  info:    'bg-bg-card border-border text-text-primary',
}

export function FlashToast() {
  const pathname = usePathname()
  const [payload, setPayload] = useState<FlashPayload | null>(null)
  const [visible, setVisible] = useState(false)

  // Re-check sessionStorage on every navigation (pathname change after redirect).
  useEffect(() => {
    const flash = readFlash()
    if (flash) {
      setPayload(flash)
      setVisible(true)
    }
  }, [pathname])

  // Same-page setFlash() dispatches a CustomEvent so we don't need a navigation.
  useEffect(() => {
    function onFlash(e: Event) {
      const detail = (e as CustomEvent<FlashPayload>).detail
      if (!detail) return
      sessionStorage.removeItem('flash')
      setPayload(detail)
      setVisible(true)
    }
    window.addEventListener(FLASH_EVENT, onFlash)
    return () => window.removeEventListener(FLASH_EVENT, onFlash)
  }, [])

  // Auto-dismiss after 3.5s. Fade out 200ms before unmount.
  useEffect(() => {
    if (!visible) return
    const fade = setTimeout(() => setVisible(false), 3300)
    const drop = setTimeout(() => setPayload(null),     3500)
    return () => { clearTimeout(fade); clearTimeout(drop) }
  }, [visible, payload])

  if (!payload) return null

  const tone = payload.tone ?? 'success'

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'fixed left-1/2 -translate-x-1/2 bottom-6 z-[100]',
        'pointer-events-auto',
        'flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-lg backdrop-blur',
        'transition-all duration-200',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
        TONE_CLASSES[tone],
      ].join(' ')}
    >
      <span className="text-sm font-medium">{payload.message}</span>
    </div>
  )
}
