import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { hasPostAccess, isActiveSubscriber } from '@/lib/access'
import { CreatorProfileClient } from './profile-client'
import { RestrictedProfile } from './restricted-profile'
import { Footer } from '@/components/footer'
import type { Post, Subscription, PostPurchase, Profile } from '@/lib/types'

export async function generateMetadata(
  props: PageProps<'/[username]'>,
): Promise<Metadata> {
  const { username } = await props.params
  const supabase = await createClient()

  const { data: creator } = await supabase
    .from('profiles')
    .select('username, display_name, bio, avatar_url, banner_url, fandom_tags, creator_status')
    .eq('username', username.toLowerCase())
    .single()

  if (!creator || creator.creator_status !== 'approved') {
    return { title: 'Creator not found', robots: { index: false } }
  }

  const name        = creator.display_name || creator.username
  const tagSuffix   = (creator.fandom_tags ?? []).slice(0, 3).join(', ')
  const description = creator.bio
    ? creator.bio.slice(0, 160)
    : `Subscribe to ${name} on CosplayXclusive${tagSuffix ? ` — ${tagSuffix}` : ''}.`
  const url         = `/${creator.username}`
  const image       = creator.banner_url || creator.avatar_url || undefined

  return {
    title:       `${name} (@${creator.username})`,
    description,
    alternates:  { canonical: url },
    openGraph: {
      title:       `${name} (@${creator.username})`,
      description,
      url,
      type:        'profile',
      images:      image ? [{ url: image }] : undefined,
    },
    twitter: {
      card:        'summary_large_image',
      title:       `${name} (@${creator.username})`,
      description,
      images:      image ? [image] : undefined,
    },
  }
}

export default async function CreatorProfilePage(props: PageProps<'/[username]'>) {
  const { username } = await props.params
  const supabase = await createClient()

  // Get viewer session + profile
  const { data: { user } } = await supabase.auth.getUser()

  let viewerProfile: Profile | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    viewerProfile = data
  }

  const isAdmin = viewerProfile?.role === 'admin'

  // Get creator profile
  const { data: creator } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username.toLowerCase())
    .not('creator_status', 'is', null)
    .single()

  // Admins can view any creator profile (including suspended); others see 404 for non-approved
  if (!creator || (!isAdmin && creator.creator_status !== 'approved')) {
    notFound()
  }

  // Block relationship — admins bypass blocks entirely
  if (user && !isAdmin && user.id !== creator.id) {
    const service = createServiceClient()
    const { data: blockRows } = await service
      .from('user_blocks')
      .select('blocker_id, blocked_id')
      .or(
        `and(blocker_id.eq.${user.id},blocked_id.eq.${creator.id}),` +
        `and(blocker_id.eq.${creator.id},blocked_id.eq.${user.id})`,
      )

    const viewerBlockedTarget = blockRows?.some(
      (r) => r.blocker_id === user.id && r.blocked_id === creator.id,
    )
    const targetBlockedViewer = blockRows?.some(
      (r) => r.blocker_id === creator.id && r.blocked_id === user.id,
    )

    // If the creator has blocked the viewer → pretend profile doesn't exist.
    if (targetBlockedViewer) notFound()

    // If the viewer has blocked the creator → restricted view only.
    if (viewerBlockedTarget) {
      return (
        <>
          <RestrictedProfile creator={creator as Profile} viewerProfile={viewerProfile} />
          <Footer />
        </>
      )
    }
  }

  // Get posts — owner and admin see all (including unpublished); everyone else only sees published
  const isOwner = viewerProfile?.id === creator.id
  let postsQuery = supabase
    .from('posts')
    .select('*')
    .eq('creator_id', creator.id)
    .order('published_at', { ascending: false })

  if (!isAdmin && !isOwner) {
    postsQuery = postsQuery.eq('published', true)
  }

  const { data: posts } = await postsQuery

  // If viewer is logged in, get their subscriptions and purchases
  let subscriptions: Subscription[] = []
  let purchases: PostPurchase[] = []

  if (user) {
    const [{ data: subs }, { data: purcs }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('*')
        .eq('fan_id', user.id)
        .eq('creator_id', creator.id),
      supabase
        .from('post_purchases')
        .select('*')
        .eq('fan_id', user.id),
    ])
    subscriptions = subs || []
    purchases = purcs || []
  }

  const viewerId = user?.id || null

  // Compute access for each post (admins always have full access)
  const postsWithAccess = (posts || []).map((post: Post) => {
    const access = isAdmin || hasPostAccess(post, viewerId, creator.id, subscriptions, purchases)
    return { post, hasAccess: access }
  })

  const subscribed = user
    ? isActiveSubscriber(user.id, creator.id, subscriptions)
    : false

  // Get signed URLs for accessible posts (server-side only)
  const postsWithUrls = await Promise.all(
    postsWithAccess.map(async ({ post, hasAccess }) => {
      let mediaUrls: string[] = []
      let previewUrls: string[] = []

      // Preview URLs (from public 'previews' bucket) — for blurred overlay
      if (post.preview_paths?.length > 0) {
        previewUrls = post.preview_paths.map(
          (path: string) =>
            `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/previews/${path}`
        )
      }

      if (hasAccess && post.media_paths?.length > 0) {
        // Generate signed URLs server-side
        const { data } = await supabase.storage
          .from('originals')
          .createSignedUrls(post.media_paths, 3600) // 1hr expiry
        mediaUrls = data?.map((d) => d.signedUrl).filter(Boolean) as string[] || []
      }

      return { post, hasAccess, mediaUrls, previewUrls }
    })
  )

  return (
    <>
      <CreatorProfileClient
        creator={creator}
        postsWithUrls={postsWithUrls}
        viewerId={viewerId}
        viewerProfile={viewerProfile}
        isSubscribed={subscribed}
        isAdmin={isAdmin}
      />
      <Footer />
    </>
  )
}
