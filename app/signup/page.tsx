'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState<'details' | 'role'>('details')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<'fan' | 'creator'>('fan')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (step === 'details') {
      setStep('role')
      return
    }

    setError('')
    setLoading(true)

    const supabase = createClient()

    // Check username uniqueness first
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.toLowerCase())
      .single()

    if (existing) {
      setError('Username is already taken. Please choose another.')
      setLoading(false)
      return
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.toLowerCase(),
          role,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // Redirect to onboarding to complete profile
    router.push('/onboarding')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-text-primary">
            <span className="text-accent text-2xl">✦</span>
            <span className="font-bold text-xl">CosplayXclusive</span>
          </Link>
          <p className="mt-2 text-text-secondary text-sm">Create your account</p>
        </div>

        {/* Card */}
        <div className="bg-bg-card border border-border rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {step === 'details' ? (
              <>
                <Input
                  label="Username"
                  type="text"
                  placeholder="cosplayer_x"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
                  required
                  minLength={3}
                  maxLength={32}
                  hint="Letters, numbers, and underscores only"
                />
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  hint="Minimum 8 characters"
                />
                <Button type="submit" size="lg" className="w-full mt-1">
                  Continue
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-text-secondary text-center">
                  How will you use <span className="text-text-primary font-medium">@{username}</span>?
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('fan')}
                    className={[
                      'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                      role === 'fan'
                        ? 'border-accent bg-accent-muted text-text-primary'
                        : 'border-border bg-bg-elevated text-text-secondary hover:border-accent/40',
                    ].join(' ')}
                  >
                    <span className="text-2xl">👀</span>
                    <div>
                      <p className="font-semibold text-sm">Fan</p>
                      <p className="text-xs text-text-muted">Subscribe & discover</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('creator')}
                    className={[
                      'flex flex-col items-center gap-2 rounded-xl border p-4 transition-all',
                      role === 'creator'
                        ? 'border-accent bg-accent-muted text-text-primary'
                        : 'border-border bg-bg-elevated text-text-secondary hover:border-accent/40',
                    ].join(' ')}
                  >
                    <span className="text-2xl">✨</span>
                    <div>
                      <p className="font-semibold text-sm">Creator</p>
                      <p className="text-xs text-text-muted">Share & earn</p>
                    </div>
                  </button>
                </div>

                {error && (
                  <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    className="flex-1"
                    onClick={() => setStep('details')}
                  >
                    Back
                  </Button>
                  <Button type="submit" loading={loading} size="lg" className="flex-1">
                    Create account
                  </Button>
                </div>
              </>
            )}
          </form>

          <p className="mt-4 text-center text-sm text-text-muted">
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:text-accent-hover font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
