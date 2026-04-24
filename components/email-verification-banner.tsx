'use client'

import { useState } from 'react'

export function EmailVerificationBanner() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleResend() {
    setStatus('sending')
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' })
      setStatus(res.ok ? 'sent' : 'error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
      <p className="text-sm text-yellow-200">
        Please verify your email address to keep full access to your account.
      </p>
      {status === 'sent' ? (
        <span className="shrink-0 text-sm text-green-400">Email sent!</span>
      ) : (
        <button
          onClick={handleResend}
          disabled={status === 'sending'}
          className="shrink-0 rounded-lg bg-yellow-500/20 px-3 py-1.5 text-xs font-medium text-yellow-200 hover:bg-yellow-500/30 transition-colors disabled:opacity-60"
        >
          {status === 'sending' ? 'Sending…' : 'Resend verification'}
        </button>
      )}
      {status === 'error' && (
        <span className="shrink-0 text-xs text-red-400">Failed — try again.</span>
      )}
    </div>
  )
}
