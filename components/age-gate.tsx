'use client'

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'cxc_age_confirmed'

export function AgeGate() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setShow(true)
  }, [])

  function confirm() {
    localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  function decline() {
    window.location.href = 'https://www.google.com'
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-card p-8 text-center shadow-2xl">
        <div className="mb-4 text-4xl">✦</div>
        <h2 className="mb-2 text-xl font-bold text-text-primary">Age Verification</h2>
        <p className="mb-6 text-sm text-text-secondary leading-relaxed">
          This website contains content intended for adults only. By entering, you confirm that
          you are 18 years of age or older and consent to viewing adult-oriented content.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={confirm}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors shadow-[0_0_15px_rgba(224,64,122,0.3)]"
          >
            I am 18 or older — Enter
          </button>
          <button
            onClick={decline}
            className="w-full rounded-xl border border-border py-3 text-sm text-text-muted hover:text-text-secondary transition-colors"
          >
            I am under 18 — Exit
          </button>
        </div>
        <p className="mt-4 text-[11px] text-text-muted">
          By entering, you agree to our{' '}
          <a href="/terms" className="underline hover:text-text-secondary">Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" className="underline hover:text-text-secondary">Privacy Policy</a>.
        </p>
      </div>
    </div>
  )
}
