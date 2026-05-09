'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ConnectButtonProps {
  profileId: string
  hasAccount: boolean
  detailsSubmitted: boolean
}

export function ConnectButton({ profileId, hasAccount, detailsSubmitted }: ConnectButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleConnect() {
    setLoading(true)
    try {
      // Fully-onboarded creators go to the account-update flow; everyone else
      // goes through onboarding (which will resume mid-flow if partial).
      const endpoint = hasAccount && detailsSubmitted
        ? '/api/connect/dashboard'
        : '/api/connect/onboard'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(false)
    }
  }

  if (hasAccount && detailsSubmitted) {
    return (
      <Button variant="secondary" size="md" onClick={handleConnect} loading={loading}>
        Manage Stripe Account →
      </Button>
    )
  }

  return (
    <Button size="md" onClick={handleConnect} loading={loading}>
      {hasAccount ? 'Complete Setup →' : 'Connect with Stripe →'}
    </Button>
  )
}
