'use client'

import { useState } from 'react'
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

export function ProfileEditForm({ profile }: { profile: Profile }) {
  const router = useRouter()
  const supabase = createClient()

  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [tags, setTags] = useState<string[]>(profile.fandom_tags || [])
  const [price, setPrice] = useState(String(profile.subscription_price_usd || '4.99'))
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || '')
  const [bannerPreview, setBannerPreview] = useState(profile.banner_url || '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerFile(file)
    setBannerPreview(URL.createObjectURL(file))
  }

  async function uploadImage(file: File, bucket: string, path: string): Promise<string> {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
    })
    if (error) throw new Error(error.message)
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setLoading(true)

    try {
      const updates: Partial<Profile> = {
        display_name: displayName || null,
        bio: bio || null,
        fandom_tags: tags,
        updated_at: new Date().toISOString(),
      }

      if (profile.creator_status != null) {
        const p = parseFloat(price)
        if (isNaN(p) || p < 0) {
          setError('Price must be $0.00 or more')
          setLoading(false)
          return
        }
        updates.subscription_price_usd = p
      }

      if (avatarFile) {
        const avatarPath = `${profile.id}/avatar.${avatarFile.name.split('.').pop()}`
        updates.avatar_url = await uploadImage(avatarFile, 'avatars', avatarPath)
      }

      if (bannerFile) {
        const bannerPath = `${profile.id}/banner.${bannerFile.name.split('.').pop()}`
        updates.banner_url = await uploadImage(bannerFile, 'banners', bannerPath)
      }

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id)

      if (error) throw new Error(error.message)

      setSuccess(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-xl">
      {/* Avatar & Banner */}
      <div className="flex flex-col gap-4">
        {/* Banner */}
        <div>
          <p className="text-sm font-medium text-text-secondary mb-2">Banner</p>
          <label className="block relative h-28 w-full rounded-xl overflow-hidden bg-bg-elevated border border-border cursor-pointer hover:border-accent/40 transition-colors group">
            {bannerPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-accent/10 to-accent-alt/10 flex items-center justify-center">
                <p className="text-text-muted text-sm">Click to upload</p>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <p className="text-white text-xs font-medium">Change banner</p>
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBannerChange}
            />
          </label>
        </div>

        {/* Avatar */}
        <div>
          <p className="text-sm font-medium text-text-secondary mb-2">Avatar</p>
          <label className="block relative h-16 w-16 rounded-full overflow-hidden bg-bg-elevated border border-border cursor-pointer hover:border-accent/40 transition-colors group">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-bg-elevated">
                <p className="text-xl">+</p>
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <p className="text-white text-xs">Edit</p>
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </label>
        </div>
      </div>

      <Input
        label="Display Name"
        placeholder={profile.username}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={60}
      />

      <Textarea
        label="Bio"
        placeholder="Tell fans about yourself..."
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={4}
        maxLength={500}
      />

      {profile.creator_status != null && (
        <Input
          label="Monthly Subscription Price (USD)"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          min="0"
          max="999"
          step="0.01"
        />
      )}

      <div>
        <p className="text-sm font-medium text-text-secondary mb-2">Fandom Tags</p>
        <div className="flex flex-wrap gap-2">
          {FANDOM_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={[
                'px-3 py-1 rounded-full text-xs font-medium transition-all border',
                tags.includes(tag)
                  ? 'bg-accent-muted border-accent/30 text-accent'
                  : 'bg-bg-elevated border-border text-text-muted hover:border-accent/30',
              ].join(' ')}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2">
          Profile updated successfully!
        </p>
      )}

      <Button type="submit" loading={loading} size="lg">
        Save Changes
      </Button>
    </form>
  )
}
