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

export interface Notification {
  id: string
  user_id: string
  type: 'new_subscriber'
  payload: {
    fan_id: string
    fan_username: string
    fan_display_name: string | null
    fan_avatar_url: string | null
    sub_type: 'free' | 'paid'
  }
  read_at: string | null
  created_at: string
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

export interface Transaction {
  id: string
  creator_id: string
  fan_id: string | null
  type: TransactionType
  amount_usd: number
  stripe_event_id: string | null
  created_at: string
}
