import type { Post, Subscription, PostPurchase } from './types'

/**
 * Check if a viewer has access to a specific post's media.
 * Returns true if the post content should be fully visible.
 *
 * Free subscriptions (subscription_price_usd = 0) are inserted with
 * current_period_end = null, meaning "no expiry". We treat null as valid.
 */
export function hasPostAccess(
  post: Post,
  viewerId: string | null,
  creatorId: string,
  subscriptions: Subscription[],
  purchases: PostPurchase[]
): boolean {
  // Owner always has access
  if (viewerId === creatorId) return true

  if (post.access_type === 'free') return true

  if (!viewerId) return false

  if (post.access_type === 'subscriber_only') {
    return subscriptions.some(
      (s) =>
        s.creator_id === creatorId &&
        s.fan_id === viewerId &&
        s.status === 'active' &&
        // null current_period_end = free/perpetual subscription (no expiry)
        (s.current_period_end == null || new Date(s.current_period_end) > new Date())
    )
  }

  if (post.access_type === 'ppv') {
    return purchases.some((p) => p.post_id === post.id && p.fan_id === viewerId)
  }

  return false
}

export function isActiveSubscriber(
  fanId: string,
  creatorId: string,
  subscriptions: Subscription[]
): boolean {
  return subscriptions.some(
    (s) =>
      s.creator_id === creatorId &&
      s.fan_id === fanId &&
      s.status === 'active' &&
      // null current_period_end = free/perpetual subscription (no expiry)
      (s.current_period_end == null || new Date(s.current_period_end) > new Date())
  )
}
