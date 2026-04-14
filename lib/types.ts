export type Role = 'fan' | 'creator' | 'admin'
export type CreatorStatus = 'pending' | 'approved' | 'rejected' | 'suspended'
export type AccessType = 'free' | 'subscriber_only' | 'ppv'
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing'
export type TransactionType = 'subscription' | 'ppv'

export interface Profile {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  banner_url: string | null
  role: Role
  creator_status: CreatorStatus | null
  subscription_price_usd: number | null
  fandom_tags: string[]
  stripe_customer_id: string | null
  stripe_account_id: string | null
  created_at: string
  updated_at: string
}

export interface Post {
  id: string
  creator_id: string
  caption: string | null
  access_type: AccessType
  price_usd: number | null
  media_paths: string[]
  preview_paths: string[]
  published_at: string
  created_at: string
  // joined
  creator?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>
}

export interface Subscription {
  id: string
  fan_id: string
  creator_id: string
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  status: SubscriptionStatus
  current_period_end: string | null
  created_at: string
  updated_at: string
}

export interface PostPurchase {
  id: string
  fan_id: string
  post_id: string
  stripe_payment_intent_id: string | null
  amount_usd: number | null
  created_at: string
}

export type NotificationType =
  | 'new_subscriber'
  | 'post_liked'
  | 'post_commented'
  | 'post_tipped'
  | 'post_like_milestone'
  | 'post_comment_milestone'
  | 'post_tip_milestone'

export interface NotificationActor {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export interface NotificationPayload {
  // new_subscriber
  fan_id?: string
  fan_username?: string
  fan_display_name?: string | null
  fan_avatar_url?: string | null
  sub_type?: 'free' | 'paid'
  // post events (liked / commented / tipped)
  post_id?: string
  post_caption?: string | null
  actors?: NotificationActor[]
  actor_count?: number
  sample_comment?: string
  total_tip_amount?: number
  // milestones
  milestone?: number
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  group_key: string | null
  payload: NotificationPayload
  read_at: string | null
  created_at: string
  last_activity_at: string
}

export interface Conversation {
  id: string
  participant_a: string
  participant_b: string
  created_at: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export interface FeedPost {
  id: string
  creator_id: string
  caption: string | null
  access_type: AccessType
  price_usd: number | null
  published_at: string
  creator: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
  mediaUrls: string[]       // signed private URLs (or preview if locked)
  previewUrls: string[]     // always-available blurred previews
  hasAccess: boolean
  likeCount: number
  hasLiked: boolean
  commentCount: number
  totalTipped: number
}

export interface FeedComment {
  id: string
  post_id: string
  user_id: string
  body: string
  created_at: string
  profile: {
    username: string
    display_name: string | null
    avatar_url: string | null
  } | null
}

export interface Transaction {
  id: string
  creator_id: string
  fan_id: string | null
  type: TransactionType
  amount_usd: number
  stripe_event_id: string | null
  created_at: string
}
