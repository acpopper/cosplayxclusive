'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Profile } from '@/lib/types'

const FANDOM_TAGS = [
  'Anime', 'Gaming', 'Marvel', 'DC', 'Fantasy',
  'Sci-Fi', 'Horror', 'JRPG', 'Mecha', 'Magical Girl',
  'Shounen', 'Seinen', 'Isekai', 'Original',
]

export default function OnboardingPage() {
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [subscriptionPrice, setSubscriptionPrice] = useState('4.99')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (data) {
        setProfile(data)
        setDisplayName(data.display_name || '')
        setBio(data.bio || '')
        setSelectedTags(data.fandom_tags || [])
      }
    }
    load()
  }, [router])

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError('')
    setLoading(true)

    const updates: Partial<Profile> = {
      display_name: displayName || profile.username,
      bio: bio || null,
      fandom_tags: selectedTags,
      updated_at: new Date().toISOString(),
    }

    if (profile.role === 'creator') {
      const price = parseFloat(subscriptionPrice)
      if (isNaN(price) || price < 0) {
        setError('Subscription price must be $0.00 or more')
        setLoading(false)
        return
      }
      updates.subscription_price_usd = price
      updates.creator_status = 'pending'
    }

    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(profile.role === 'creator' ? '/dashboard' : '/explore')
    router.refresh()
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-accent text-3xl">✦</span>
          <h1 className="mt-2 text-xl font-bold text-text-primary">
            {profile.role === 'creator' ? 'Set up your creator profile' : 'Complete your profile'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {profile.role === 'creator'
              ? 'Your profile is what fans will see first'
              : 'Personalize your experience'}
          </p>
        </div>

        <div className="bg-bg-card border border-border rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input
              label="Display Name"
              placeholder={profile.username}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
            />

            {profile.role === 'creator' && (
              <Textarea
                label="Bio"
                placeholder="Tell fans about your cosplay style, characters you love, what they can expect..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={500}
              />
            )}

            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">Fandoms & Interests</p>
              <div className="flex flex-wrap gap-2">
                {FANDOM_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={[
                      'px-3 py-1 rounded-full text-xs font-medium transition-all border',
                      selectedTags.includes(tag)
                        ? 'bg-accent-muted border-accent/30 text-accent'
                        : 'bg-bg-elevated border-border text-text-muted hover:border-accent/30 hover:text-text-secondary',
                    ].join(' ')}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {profile.role === 'creator' && (
              <div>
                <Input
                  label="Monthly Subscription Price (USD)"
                  type="number"
                  placeholder="4.99"
                  value={subscriptionPrice}
                  onChange={(e) => setSubscriptionPrice(e.target.value)}
                  min="0"
                  max="999"
                  step="0.01"
                  hint="Set to $0 for a free account — You keep ~80% after fees on paid plans"
                />
              </div>
            )}

            {profile.role === 'creator' && (
              <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
                <p className="text-xs text-warning/90">
                  ⚡ Creator accounts require manual approval before going live. We&apos;ll review your profile and get back to you shortly.
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} size="lg" className="w-full">
              {profile.role === 'creator' ? 'Submit for review' : 'Get started'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
