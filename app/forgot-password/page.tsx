'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-text-primary">
            <span className="text-accent text-2xl">✦</span>
            <span className="font-bold text-xl">CosplayXclusive</span>
          </Link>
          <p className="mt-2 text-text-secondary text-sm">Reset your password</p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6 shadow-2xl">
          {sent ? (
            <div className="text-center">
              <div className="text-3xl mb-3">📬</div>
              <h2 className="text-lg font-bold text-text-primary mb-1">Check your inbox</h2>
              <p className="text-sm text-text-secondary mb-5">
                If an account exists for <span className="font-medium text-text-primary">{email}</span>,
                we&apos;ve sent a link to reset your password.
              </p>
              <Link href="/login" className="text-sm text-accent hover:text-accent-hover font-medium">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-text-secondary">
                Enter your account email and we&apos;ll send you a link to set a new password.
              </p>

              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />

              {error && (
                <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" loading={loading} size="lg" className="w-full">
                Send reset link
              </Button>

              <Link
                href="/login"
                className="text-center text-xs text-text-muted hover:text-accent transition-colors"
              >
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
