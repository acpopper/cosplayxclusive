// Client-safe email category metadata. Kept in its own module (no server-only
// imports) so client components can import EMAIL_CATEGORIES / EmailCategory
// without pulling `next/headers` into the browser bundle via lib/email.ts.

export type EmailCategory =
  | 'account_security'
  | 'payment_receipts'
  | 'payment_alerts'
  | 'creator_activity'
  | 'creator_milestones'
  | 'creator_summary_monthly'
  | 'fan_activity'
  | 'fan_summary_monthly'
  | 'direct_messages'
  | 'product_updates'
  | 'inactive_nudge'

export interface CategoryMeta {
  required:    boolean
  default:     boolean
  label:       string
  description: string
}

export const EMAIL_CATEGORIES: Record<EmailCategory, CategoryMeta> = {
  account_security: {
    required:    true,
    default:     true,
    label:       'Account & security',
    description: 'Email verification, password changes, sign-ins from new devices.',
  },
  payment_receipts: {
    required:    true,
    default:     true,
    label:       'Payment receipts',
    description: 'Confirmation when you subscribe, unlock content, send a tip, or get a refund.',
  },
  payment_alerts: {
    required:    true,
    default:     true,
    label:       'Payment problems',
    description: 'Failed charges, expiring cards, payout failures.',
  },
  creator_activity: {
    required:    false,
    default:     true,
    label:       'Creator activity',
    description: 'New subscribers, comments, tips, and PPV purchases on your content.',
  },
  creator_milestones: {
    required:    false,
    default:     true,
    label:       'Creator milestones',
    description: 'Subscriber-count and revenue milestones worth celebrating.',
  },
  creator_summary_monthly: {
    required:    false,
    default:     true,
    label:       'Monthly creator summary',
    description: 'Once-a-month recap of your subscribers, posts, and earnings.',
  },
  fan_activity: {
    required:    false,
    default:     true,
    label:       'New posts from creators you follow',
    description: 'Daily-digest notifications about creators you subscribe to.',
  },
  fan_summary_monthly: {
    required:    false,
    default:     true,
    label:       'Monthly fan summary',
    description: 'Once-a-month digest of new content from creators you follow.',
  },
  direct_messages: {
    required:    false,
    default:     true,
    label:       'Missed direct messages',
    description: 'When you receive a DM and aren’t online to read it.',
  },
  product_updates: {
    required:    false,
    default:     false,
    label:       'Product news & announcements',
    description: 'New platform features, promotions, and announcements.',
  },
  inactive_nudge: {
    required:    false,
    default:     false,
    label:       'Re-engagement reminders',
    description: 'Occasional nudges if you haven’t logged in for a while.',
  },
}

export const TOGGLEABLE_CATEGORIES = (Object.entries(EMAIL_CATEGORIES) as Array<[EmailCategory, CategoryMeta]>)
  .filter(([, meta]) => !meta.required)
  .map(([key]) => key)

export type EmailPreferencesRow = {
  [K in (typeof TOGGLEABLE_CATEGORIES)[number]]: boolean
}
