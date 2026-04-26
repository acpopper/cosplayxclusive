'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import posthog from 'posthog-js'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
          role: 'user',
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      posthog.captureException(signUpError)
      setLoading(false)
      return
    }

    posthog.identify(username.toLowerCase(), { email })
    posthog.capture('user_signed_up', { username: username.toLowerCase() })

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

            {error && (
              <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} size="lg" className="w-full mt-1">
              Create account
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-text-muted">
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:text-accent-hover font-medium">
              Sign in
            </Link>
          </p>

          <p className="mt-3 text-center text-xs text-text-muted leading-relaxed">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="text-accent hover:underline">Terms &amp; Conditions</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
            You must be 18 or older to register.
          </p>
        </div>
      </div>
    </div>
  )
}
