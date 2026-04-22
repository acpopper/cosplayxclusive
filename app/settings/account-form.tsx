'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface AccountFormProps {
  currentUsername: string
  currentEmail: string
}

export function AccountForm({ currentUsername, currentEmail }: AccountFormProps) {
  const router = useRouter()

  return (
    <div className="flex flex-col gap-6">
      <UsernameRow currentUsername={currentUsername} onUpdated={() => router.refresh()} />
      <div className="h-px bg-border" />
      <EmailRow currentEmail={currentEmail} />
      <div className="h-px bg-border" />
      <PasswordRow currentEmail={currentEmail} />
    </div>
  )
}

/* ── Username ──────────────────────────────────────────── */
function UsernameRow({
  currentUsername,
  onUpdated,
}: {
  currentUsername: string
  onUpdated: () => void
}) {
  const [username, setUsername] = useState(currentUsername)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    if (username === currentUsername) {
      setError('That\u2019s already your username.')
      return
    }
    setLoading(true)
    const res = await fetch('/api/account/username', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(json.error ?? 'Could not update username.')
      return
    }
    setSuccess(true)
    onUpdated()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="text-sm font-medium text-text-secondary">Username</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">@</span>
          <Input
            type="text"
            value={username}
            onChange={(e) =>
              setUsername(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())
            }
            className="pl-7"
            maxLength={24}
            required
          />
        </div>
        <Button type="submit" variant="secondary" size="md" loading={loading}>
          Save
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        3–24 chars. Lowercase letters, numbers, or underscores.
      </p>
      {error && <p className="text-xs text-error">{error}</p>}
      {success && <p className="text-xs text-success">Username updated.</p>}
    </form>
  )
}

/* ── Email ─────────────────────────────────────────────── */
function EmailRow({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (email === currentEmail) {
      setError('That\u2019s already your email.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ email })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setMessage('Check both your old and new inbox to confirm the change.')
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="text-sm font-medium text-text-secondary">Email</label>
      <div className="flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" variant="secondary" size="md" loading={loading}>
          Save
        </Button>
      </div>
      <p className="text-xs text-text-muted">
        Changing your email requires confirmation from both addresses.
      </p>
      {error && <p className="text-xs text-error">{error}</p>}
      {message && <p className="text-xs text-success">{message}</p>}
    </form>
  )
}

/* ── Password ──────────────────────────────────────────── */
function PasswordRow({ currentEmail }: { currentEmail: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()

    // Re-authenticate with the current password before allowing a change.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: currentPassword,
    })
    if (reauthError) {
      setLoading(false)
      setError('Current password is incorrect.')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setLoading(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setSuccess(true)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-text-secondary">Password</label>
      <Input
        type="password"
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      <Input
        type="password"
        placeholder="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />
      <Input
        type="password"
        placeholder="Confirm new password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">At least 8 characters.</p>
        <Button type="submit" variant="secondary" size="md" loading={loading}>
          Update password
        </Button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {success && <p className="text-xs text-success">Password updated.</p>}
    </form>
  )
}
