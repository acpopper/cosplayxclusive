'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [ready, setReady] = useState(false)
  const [authError, setAuthError] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  // When the user arrives from the email link, Supabase emits
  // a PASSWORD_RECOVERY event with a temporary session.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    // If the event already fired before we subscribed, fall back on a
    // session check after a short delay.
    timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) setReady(true)
      else setAuthError('This reset link is invalid or has expired. Please request a new one.')
    }, 1200)

    return () => {
      sub.subscription.unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    // Give the user a moment to read the confirmation, then send them home.
    setTimeout(() => router.push('/home'), 1500)
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-text-primary">
            <span className="text-accent text-2xl">✦</span>
            <span className="font-bold text-xl">CosplayXclusive</span>
          </Link>
          <p className="mt-2 text-text-secondary text-sm">Choose a new password</p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6 shadow-2xl">
          {done ? (
            <div className="text-center">
              <div className="text-3xl mb-3">✓</div>
              <h2 className="text-lg font-bold text-text-primary mb-1">Password updated</h2>
              <p className="text-sm text-text-secondary">Signing you in…</p>
            </div>
          ) : authError ? (
            <div className="text-center">
              <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-3 mb-4">
                {authError}
              </p>
              <Link href="/forgot-password" className="text-sm text-accent hover:text-accent-hover font-medium">
                Request a new link
              </Link>
            </div>
          ) : !ready ? (
            <div className="text-center py-8 text-sm text-text-muted">Verifying link…</div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                label="New password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
              <Input
                label="Confirm new password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />

              {error && (
                <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" loading={loading} size="lg" className="w-full">
                Set new password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
