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

export type Audience = 'all' | 'creator'

export interface CategoryMeta {
  required:    boolean
  default:     boolean
  /**
   * Which user types see this category in the notification-settings UI.
   * - `'all'`: everyone (fans, creators, admins).
   * - `'creator'`: approved creators (and admins) only — hidden from fans.
   */
  audience:    Audience
  /**
   * False if no code path actually triggers an email of this category yet.
   * Unimplemented categories stay in the type/DB so we can ship the email
   * later without a migration, but they're hidden from the UI so users
   * aren't promised emails they'll never receive.
   */
  implemented: boolean
  label:       string
  description: string
}

export const EMAIL_CATEGORIES: Record<EmailCategory, CategoryMeta> = {
  account_security: {
    required:    true,
    default:     true,
    audience:    'all',
    implemented: true,
    label:       'Account & security',
    description: 'Email verification, password changes, sign-ins from new devices.',
  },
  payment_receipts: {
    required:    true,
    default:     true,
    audience:    'all',
    implemented: true,
    label:       'Payment receipts',
    description: 'Confirmation when you subscribe, unlock content, send a tip, get a refund, or receive a payout.',
  },
  payment_alerts: {
    required:    true,
    default:     true,
    audience:    'all',
    implemented: true,
    label:       'Payment problems',
    description: 'Failed charges, expiring cards, payout failures, Stripe verification requests.',
  },
  creator_activity: {
    required:    false,
    default:     true,
    audience:    'creator',
    implemented: true,
    label:       'Creator activity',
    description: 'New subscribers, comments, tips, and PPV unlocks on your content.',
  },
  creator_milestones: {
    required:    false,
    default:     true,
    audience:    'creator',
    implemented: true,
    label:       'Creator milestones',
    description: 'Subscriber-count and revenue milestones worth celebrating.',
  },

  // ── Categories below are reserved for future emails. Kept in the type
  // and DB so we can flip `implemented: true` without a migration, but
  // hidden from the settings UI today.
  creator_summary_monthly: {
    required:    false,
    default:     true,
    audience:    'creator',
    implemented: false,
    label:       'Monthly creator summary',
    description: 'Once-a-month recap of your subscribers, posts, and earnings.',
  },
  fan_activity: {
    required:    false,
    default:     true,
    audience:    'all',
    implemented: false,
    label:       'New posts from creators you follow',
    description: 'Daily-digest notifications about creators you subscribe to.',
  },
  fan_summary_monthly: {
    required:    false,
    default:     true,
    audience:    'all',
    implemented: false,
    label:       'Monthly fan summary',
    description: 'Once-a-month digest of new content from creators you follow.',
  },
  direct_messages: {
    required:    false,
    default:     true,
    audience:    'all',
    implemented: false,
    label:       'Missed direct messages',
    description: 'When you receive a DM and aren’t online to read it.',
  },
  product_updates: {
    required:    false,
    default:     false,
    audience:    'all',
    implemented: false,
    label:       'Product news & announcements',
    description: 'New platform features, promotions, and announcements.',
  },
  inactive_nudge: {
    required:    false,
    default:     false,
    audience:    'all',
    implemented: false,
    label:       'Re-engagement reminders',
    description: 'Occasional nudges if you haven’t logged in for a while.',
  },
}

export const TOGGLEABLE_CATEGORIES = (Object.entries(EMAIL_CATEGORIES) as Array<[EmailCategory, CategoryMeta]>)
  .filter(([, meta]) => !meta.required)
  .map(([key]) => key)

/**
 * The toggleable categories that should appear in the settings UI for a
 * given user. Filters out (a) unimplemented categories — those don't have
 * any send path yet — and (b) creator-only categories when the user isn't
 * an approved creator (or admin).
 */
export function visibleToggleableCategories(opts: { isCreator: boolean }): EmailCategory[] {
  return (Object.entries(EMAIL_CATEGORIES) as Array<[EmailCategory, CategoryMeta]>)
    .filter(([, m]) => !m.required && m.implemented)
    .filter(([, m]) => m.audience === 'all' || opts.isCreator)
    .map(([k]) => k)
}

/**
 * The required (always-on) categories that should appear in the "Always on"
 * section for a given user. Same audience-filter rules as the toggleable
 * helper, but `implemented` is enforced anyway by the required-category set.
 */
export function visibleRequiredCategories(opts: { isCreator: boolean }): EmailCategory[] {
  return (Object.entries(EMAIL_CATEGORIES) as Array<[EmailCategory, CategoryMeta]>)
    .filter(([, m]) => m.required && m.implemented)
    .filter(([, m]) => m.audience === 'all' || opts.isCreator)
    .map(([k]) => k)
}

export type EmailPreferencesRow = {
  [K in (typeof TOGGLEABLE_CATEGORIES)[number]]: boolean
}
