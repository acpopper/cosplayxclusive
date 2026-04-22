'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Profile } from '@/lib/types'

interface Props {
  profile: Profile
  isReapply: boolean
}

export function CreatorApplyForm({ profile, isReapply }: Props) {
  const router = useRouter()

  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [contentDesc, setContentDesc] = useState('')
  const [socialLinks, setSocialLinks] = useState('')
  const [motivation, setMotivation] = useState('')
  const [price, setPrice] = useState(String(profile.subscription_price_usd || '4.99'))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!contentDesc.trim()) {
      setError('Please describe the content you plan to create.')
      return
    }
    if (!motivation.trim()) {
      setError('Please tell us why you want to join CosplayXclusive.')
      return
    }
    const priceNum = parseFloat(price)
    if (isNaN(priceNum) || priceNum < 0) {
      setError('Please enter a valid subscription price (0 for free).')
      return
    }

    setLoading(true)

    const applicationText = [
      `=== Content Description ===\n${contentDesc.trim()}`,
      `=== Why CosplayXclusive ===\n${motivation.trim()}`,
      socialLinks.trim() ? `=== Social / Portfolio Links ===\n${socialLinks.trim()}` : null,
    ].filter(Boolean).join('\n\n')

    const res = await fetch('/api/creator-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: displayName.trim() || profile.username,
        bio: bio.trim() || null,
        application: applicationText,
        subscriptionPrice: priceNum,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    router.push('/settings')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {isReapply && (
        <div className="p-3 bg-warning/5 border border-warning/20 rounded-xl text-sm text-warning/90">
          ⚡ You&apos;re reapplying after a previous rejection. Make sure to address any feedback you received in your messages.
        </div>
      )}

      {/* Basic profile */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-text-primary">Your profile</h2>

        <Input
          label="Display Name"
          placeholder={profile.username}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          hint="This is what fans will see"
        />

        <Textarea
          label="Bio"
          placeholder="Tell fans about your cosplay style, the characters you love, what they can expect from your content..."
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </div>

      {/* Application questions */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-text-primary">Creator application</h2>

        <Textarea
          label="What kind of cosplay content will you create? *"
          placeholder="e.g. Weekly photo sets of anime characters, WIP build videos, behind-the-scenes of cosplay events, original character designs..."
          value={contentDesc}
          onChange={(e) => setContentDesc(e.target.value)}
          rows={4}
          maxLength={1000}
          required
        />

        <Textarea
          label="Why do you want to join CosplayXclusive? *"
          placeholder="Tell us about your passion for cosplay, your goals as a creator, and what makes your content unique..."
          value={motivation}
          onChange={(e) => setMotivation(e.target.value)}
          rows={4}
          maxLength={1000}
          required
        />

        <Textarea
          label="Links to existing cosplay work (optional)"
          placeholder="Instagram, Twitter/X, TikTok, portfolio site, etc. One per line."
          value={socialLinks}
          onChange={(e) => setSocialLinks(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </div>

      {/* Pricing */}
      <div className="bg-bg-card border border-border rounded-2xl p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-text-primary">Subscription pricing</h2>
        <Input
          label="Monthly Subscription Price (USD)"
          type="number"
          placeholder="4.99"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          min="0"
          max="999"
          step="0.01"
          hint="Set to $0.00 for a free account · You keep ~80% of all paid subscriptions"
        />
      </div>

      <div className="p-3 bg-bg-card border border-border rounded-xl text-xs text-text-muted leading-relaxed">
        By applying you confirm you are at least 18 years old and agree to our{' '}
        <a href="/terms" className="text-accent hover:underline" target="_blank" rel="noopener">Terms &amp; Conditions</a>{' '}
        and{' '}
        <a href="/privacy" className="text-accent hover:underline" target="_blank" rel="noopener">Privacy Policy</a>.
        All content must comply with our community standards.
      </div>

      {error && (
        <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" size="lg" loading={loading} className="flex-1">
          {isReapply ? 'Submit updated application' : 'Submit application'}
        </Button>
      </div>
    </form>
  )
}
