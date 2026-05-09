import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/server'

const resend = new Resend(process.env.RESEND_API_KEY)
const APP    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cosplayxclusive.com'

// ─── Email categories ────────────────────────────────────────────────────────
// `required: true` — always sent (security / legal / money safety). Not in DB.
// `required: false` — backed by a column in `email_preferences`. The DB column
// name MUST match the key. `default` here mirrors the column default so a user
// with no row sees the same behavior as one with a freshly-defaulted row.

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

interface CategoryMeta {
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

/**
 * Returns true if the email should be delivered. Checks (in order):
 *   1. Suppression list (bounces / complaints / manual blocks) — always wins.
 *   2. Per-user category preference, defaulting to the category's default
 *      when no row exists. Required categories skip this step.
 *
 * `userId` may be null for pre-account flows (e.g. sign-up verification);
 * in that case we only consult the suppression list.
 */
async function shouldSend(
  toEmail:  string,
  userId:   string | null,
  category: EmailCategory,
): Promise<boolean> {
  const lower = toEmail.toLowerCase()
  const service = createServiceClient()

  const { data: suppressed } = await service
    .from('email_suppressions')
    .select('email')
    .eq('email', lower)
    .maybeSingle()

  if (suppressed) return false
  if (EMAIL_CATEGORIES[category].required) return true
  if (!userId) return true

  const { data: prefs } = await service
    .from('email_preferences')
    .select(category)
    .eq('user_id', userId)
    .maybeSingle()

  if (!prefs) return EMAIL_CATEGORIES[category].default
  const value = (prefs as Record<string, boolean | null>)[category]
  return value ?? EMAIL_CATEGORIES[category].default
}

// ─── shared helpers ──────────────────────────────────────────────────────────

/** Pick a friendly first-name greeting from whatever we know about the user. */
function greetingName(displayName: string | null | undefined, username: string | null | undefined, email: string): string {
  const trimmed = displayName?.trim()
  if (trimmed) return trimmed.split(/\s+/)[0]
  if (username) return username
  return email.split('@')[0]
}

function usd(amount: number): string {
  return `$${amount.toFixed(2)}`
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

function shortId(id: string): string {
  return id.length > 16 ? id.slice(-12).toUpperCase() : id.toUpperCase()
}

type Vars = Record<string, string | number | boolean>

async function sendTemplate(toEmail: string, alias: string, variables: Vars): Promise<void> {
  await resend.emails.send({
    to:       toEmail,
    template: { id: alias, variables },
  } as Parameters<typeof resend.emails.send>[0]).catch(err => {
    console.error(`[email] template ${alias} failed:`, err)
  })
}

// ─── Creator application lifecycle (17, 18, 19) ──────────────────────────────

export async function sendApplicationSubmitted(opts: {
  userId:          string
  toEmail:         string
  displayName:     string | null
  username:        string
  applicationId:   string
  submittedAt:     Date | string
}): Promise<void> {
  if (!(await shouldSend(opts.toEmail, opts.userId, 'account_security'))) return
  await sendTemplate(opts.toEmail, '17-application-submitted', {
    first_name:     greetingName(opts.displayName, opts.username, opts.toEmail),
    review_window:  '3 business days',
    when:           formatDateTime(opts.submittedAt),
    application_id: shortId(opts.applicationId),
    action_url:     `${APP}/settings/creator-apply`,
  })
}

export async function sendCreatorApproved(opts: {
  userId:      string
  toEmail:     string
  displayName: string | null
  username:    string
}): Promise<void> {
  if (!(await shouldSend(opts.toEmail, opts.userId, 'account_security'))) return
  await sendTemplate(opts.toEmail, '18-creator-approved', {
    first_name:     greetingName(opts.displayName, opts.username, opts.toEmail),
    creator_handle: opts.username,
    action_url:     `${APP}/dashboard`,
  })
}

export async function sendCreatorRejected(opts: {
  userId:      string
  toEmail:     string
  displayName: string | null
  username:    string
  reason?:     string
}): Promise<void> {
  if (!(await shouldSend(opts.toEmail, opts.userId, 'account_security'))) return
  const reapplyDate = new Date()
  reapplyDate.setDate(reapplyDate.getDate() + 30)
  await sendTemplate(opts.toEmail, '19-creator-rejected', {
    first_name:   greetingName(opts.displayName, opts.username, opts.toEmail),
    reason:       opts.reason ?? 'Your application did not meet our current creator guidelines.',
    reapply_date: formatDate(reapplyDate),
    action_url:   `${APP}/support`,
    appeal_url:   `${APP}/support?topic=creator-appeal`,
  })
}

// ─── Stripe Connect status (20, 21) ──────────────────────────────────────────

export async function sendStripeOnboarded(opts: {
  userId:           string
  toEmail:          string
  displayName:      string | null
  username:         string
  bankName?:        string
  bankLast4?:       string
  payoutSchedule?:  string
  currency?:        string
  firstPayoutDate?: Date | string
}): Promise<void> {
  if (!(await shouldSend(opts.toEmail, opts.userId, 'account_security'))) return
  const schedule = opts.payoutSchedule ?? 'Weekly (every Friday)'
  const firstPayout = opts.firstPayoutDate
    ? formatDate(opts.firstPayoutDate)
    : formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  await sendTemplate(opts.toEmail, '20-stripe-connect-onboarded', {
    first_name:            greetingName(opts.displayName, opts.username, opts.toEmail),
    bank_name:             opts.bankName ?? 'Bank account',
    bank_last4:            opts.bankLast4 ?? '••••',
    payout_schedule:       schedule,
    payout_schedule_lower: schedule.toLowerCase(),
    currency:              (opts.currency ?? 'USD').toUpperCase(),
    first_payout_date:     firstPayout,
    action_url:            `${APP}/dashboard/connect`,
  })
}

export async function sendStripeNeedsAttention(opts: {
  userId:           string
  toEmail:          string
  displayName:      string | null
  username:         string
  requirements:     string[]
  deadline?:        Date | string | null
  pendingBalanceUsd: number
}): Promise<void> {
  if (!(await shouldSend(opts.toEmail, opts.userId, 'payment_alerts'))) return
  const reqList = opts.requirements.length
    ? opts.requirements.map(r => `• ${r.replace(/_/g, ' ')}`).join('\n')
    : '• Additional verification information'
  await sendTemplate(opts.toEmail, '21-stripe-needs-attention', {
    first_name:        greetingName(opts.displayName, opts.username, opts.toEmail),
    requirements_list: reqList,
    deadline:          opts.deadline ? formatDate(opts.deadline) : 'As soon as possible',
    pending_balance:   usd(opts.pendingBalanceUsd),
    action_url:        `${APP}/dashboard/connect`,
  })
}

// ─── Creator activity (22, 23, 24, 25, 26, 27) ───────────────────────────────

export async function sendNewPaidSubscriber(opts: {
  creatorUserId:     string
  creatorEmail:      string
  creatorDisplayName: string | null
  creatorUsername:   string
  fanUsername:       string
  fanDisplayName:    string | null
  amountUsd:         number
  creatorCutUsd:     number
  totalSubscribers:  number
  mrrUsd:            number
}): Promise<void> {
  if (!(await shouldSend(opts.creatorEmail, opts.creatorUserId, 'creator_activity'))) return
  await sendTemplate(opts.creatorEmail, '22-new-paid-subscriber', {
    first_name:        greetingName(opts.creatorDisplayName, opts.creatorUsername, opts.creatorEmail),
    fan_handle:        opts.fanUsername,
    fan_display_name:  opts.fanDisplayName || opts.fanUsername,
    amount:            usd(opts.amountUsd),
    creator_cut:       usd(opts.creatorCutUsd),
    total_subscribers: opts.totalSubscribers,
    mrr:               usd(opts.mrrUsd),
    action_url:        `${APP}/dashboard`,
  })
}

export async function sendNewFreeFollower(opts: {
  creatorUserId:     string
  creatorEmail:      string
  creatorDisplayName: string | null
  creatorUsername:   string
  fanUsername:       string
  fanDisplayName:    string | null
  totalFollowers:    number
}): Promise<void> {
  if (!(await shouldSend(opts.creatorEmail, opts.creatorUserId, 'creator_activity'))) return
  await sendTemplate(opts.creatorEmail, '23-new-free-follower', {
    first_name:       greetingName(opts.creatorDisplayName, opts.creatorUsername, opts.creatorEmail),
    fan_handle:       opts.fanUsername,
    fan_display_name: opts.fanDisplayName || opts.fanUsername,
    total_followers:  opts.totalFollowers,
    action_url:       `${APP}/${opts.fanUsername}`,
  })
}

export async function sendFirstSubscriberMilestone(opts: {
  creatorUserId:      string
  creatorEmail:       string
  creatorDisplayName: string | null
  creatorUsername:    string
  fanUsername:        string
}): Promise<void> {
  if (!(await shouldSend(opts.creatorEmail, opts.creatorUserId, 'creator_milestones'))) return
  await sendTemplate(opts.creatorEmail, '24-first-subscriber-milestone', {
    first_name: greetingName(opts.creatorDisplayName, opts.creatorUsername, opts.creatorEmail),
    fan_handle: opts.fanUsername,
    action_url: `${APP}/messages`,
  })
}

export async function sendNewPpvUnlock(opts: {
  creatorUserId:      string
  creatorEmail:       string
  creatorDisplayName: string | null
  creatorUsername:    string
  fanUsername:        string
  source:             'post' | 'message'
  contentTitle:       string
  amountUsd:          number
  creatorCutUsd:      number
  totalUnlocks:       number
}): Promise<void> {
  if (!(await shouldSend(opts.creatorEmail, opts.creatorUserId, 'creator_activity'))) return
  await sendTemplate(opts.creatorEmail, '25-new-ppv-unlock', {
    first_name:    greetingName(opts.creatorDisplayName, opts.creatorUsername, opts.creatorEmail),
    fan_handle:    opts.fanUsername,
    source_label:  opts.source === 'message' ? 'PPV message' : 'PPV post',
    content_title: opts.contentTitle,
    content_type:  opts.source === 'message' ? 'Message' : 'Post',
    amount:        usd(opts.amountUsd),
    creator_cut:   usd(opts.creatorCutUsd),
    total_unlocks: opts.totalUnlocks,
    action_url:    `${APP}/dashboard`,
  })
}

export async function sendNewTip(opts: {
  creatorUserId:      string
  creatorEmail:       string
  creatorDisplayName: string | null
  creatorUsername:    string
  fanUsername:        string
  amountUsd:          number
  creatorCutUsd:      number
  message?:           string | null
}): Promise<void> {
  if (!(await shouldSend(opts.creatorEmail, opts.creatorUserId, 'creator_activity'))) return
  await sendTemplate(opts.creatorEmail, '26-new-tip', {
    first_name:   greetingName(opts.creatorDisplayName, opts.creatorUsername, opts.creatorEmail),
    fan_handle:   opts.fanUsername,
    amount:       usd(opts.amountUsd),
    creator_cut:  usd(opts.creatorCutUsd),
    has_message:  Boolean(opts.message),
    tip_message:  opts.message ?? '',
    action_url:   `${APP}/messages`,
  })
}

export async function sendNewComment(opts: {
  creatorUserId:      string
  creatorEmail:       string
  creatorDisplayName: string | null
  creatorUsername:    string
  commenterUsername:  string
  postCaption:        string | null
  postId:             string
  commentBody:        string
}): Promise<void> {
  if (!(await shouldSend(opts.creatorEmail, opts.creatorUserId, 'creator_activity'))) return
  const title = opts.postCaption?.trim()
    ? (opts.postCaption.length > 60 ? opts.postCaption.slice(0, 60) + '…' : opts.postCaption)
    : 'your post'
  await sendTemplate(opts.creatorEmail, '27-new-comment', {
    first_name:   greetingName(opts.creatorDisplayName, opts.creatorUsername, opts.creatorEmail),
    fan_handle:   opts.commenterUsername,
    post_title:   title,
    comment_text: opts.commentBody.length > 240 ? opts.commentBody.slice(0, 240) + '…' : opts.commentBody,
    action_url:   `${APP}/posts/${opts.postId}`,
  })
}

// ─── Fan receipts & alerts (10, 11, 12, 14, 15, 16) ──────────────────────────

interface CardInfo { brand: string; last4: string }

export async function sendSubscriptionReceipt(opts: {
  fanUserId:        string
  fanEmail:         string
  fanDisplayName:   string | null
  fanUsername:      string
  creatorName:      string
  creatorUsername:  string
  amountUsd:        number
  isRenewal:        boolean
  orderId:          string
  card?:            CardInfo | null
  paidAt:           Date | string
  nextBillingDate?: Date | string | null
}): Promise<void> {
  if (!(await shouldSend(opts.fanEmail, opts.fanUserId, 'payment_receipts'))) return
  await sendTemplate(opts.fanEmail, '10-subscription-receipt', {
    first_name:        greetingName(opts.fanDisplayName, opts.fanUsername, opts.fanEmail),
    is_renewal_or_new: opts.isRenewal ? 'Renewed' : 'New',
    creator_name:      opts.creatorName,
    creator_handle:    opts.creatorUsername,
    amount:            usd(opts.amountUsd),
    when:              formatDateTime(opts.paidAt),
    order_id:          shortId(opts.orderId),
    card_brand:        opts.card?.brand ?? 'Card',
    card_last4:        opts.card?.last4 ?? '••••',
    next_billing_date: opts.nextBillingDate ? formatDate(opts.nextBillingDate) : 'next month',
    action_url:        `${APP}/settings`,
  })
}

export async function sendSubscriptionCanceled(opts: {
  fanUserId:       string
  fanEmail:        string
  fanDisplayName:  string | null
  fanUsername:     string
  creatorName:     string
  creatorUsername: string
  accessEnds:      Date | string
}): Promise<void> {
  if (!(await shouldSend(opts.fanEmail, opts.fanUserId, 'payment_receipts'))) return
  await sendTemplate(opts.fanEmail, '11-subscription-canceled', {
    first_name:     greetingName(opts.fanDisplayName, opts.fanUsername, opts.fanEmail),
    creator_name:   opts.creatorName,
    creator_handle: opts.creatorUsername,
    access_ends:    formatDate(opts.accessEnds),
    action_url:     `${APP}/${opts.creatorUsername}`,
    feedback_url:   `${APP}/support?topic=cancel-feedback`,
  })
}

export async function sendPaymentFailed(opts: {
  fanUserId:       string
  fanEmail:        string
  fanDisplayName:  string | null
  fanUsername:     string
  creatorName:     string
  amountUsd:       number
  card?:           CardInfo | null
  declineReason:   string
  accessPausesOn:  Date | string
}): Promise<void> {
  if (!(await shouldSend(opts.fanEmail, opts.fanUserId, 'payment_alerts'))) return
  await sendTemplate(opts.fanEmail, '12-payment-failed', {
    first_name:       greetingName(opts.fanDisplayName, opts.fanUsername, opts.fanEmail),
    creator_name:     opts.creatorName,
    amount:           usd(opts.amountUsd),
    card_brand:       opts.card?.brand ?? 'Card',
    card_last4:       opts.card?.last4 ?? '••••',
    decline_reason:   opts.declineReason,
    access_pauses_on: formatDate(opts.accessPausesOn),
    action_url:       `${APP}/settings`,
  })
}

export async function sendPpvUnlockReceipt(opts: {
  fanUserId:          string
  fanEmail:           string
  fanDisplayName:     string | null
  fanUsername:        string
  creatorUsername:    string
  contentTitle:       string
  contentType:        'Post' | 'Message'
  contentDescription: string
  amountUsd:          number
  orderId:            string
  card?:              CardInfo | null
  paidAt:             Date | string
  viewUrl:            string
}): Promise<void> {
  if (!(await shouldSend(opts.fanEmail, opts.fanUserId, 'payment_receipts'))) return
  await sendTemplate(opts.fanEmail, '14-ppv-unlock-receipt', {
    first_name:          greetingName(opts.fanDisplayName, opts.fanUsername, opts.fanEmail),
    content_title:       opts.contentTitle,
    creator_handle:      opts.creatorUsername,
    content_type:        opts.contentType,
    content_description: opts.contentDescription,
    amount:              usd(opts.amountUsd),
    when:                formatDateTime(opts.paidAt),
    order_id:            shortId(opts.orderId),
    card_brand:          opts.card?.brand ?? 'Card',
    card_last4:          opts.card?.last4 ?? '••••',
    action_url:          opts.viewUrl,
  })
}

export async function sendTipReceipt(opts: {
  fanUserId:       string
  fanEmail:        string
  fanDisplayName:  string | null
  fanUsername:     string
  creatorName:     string
  creatorUsername: string
  amountUsd:       number
  orderId:         string
  card?:           CardInfo | null
  paidAt:          Date | string
  postCaption?:    string | null
  postId?:         string
  message?:        string | null
}): Promise<void> {
  if (!(await shouldSend(opts.fanEmail, opts.fanUserId, 'payment_receipts'))) return
  const tipContext = opts.postCaption
    ? ` on "${opts.postCaption.length > 40 ? opts.postCaption.slice(0, 40) + '…' : opts.postCaption}"`
    : ''
  await sendTemplate(opts.fanEmail, '15-tip-receipt', {
    first_name:        greetingName(opts.fanDisplayName, opts.fanUsername, opts.fanEmail),
    creator_name:      opts.creatorName,
    creator_handle:    opts.creatorUsername,
    amount:            usd(opts.amountUsd),
    when:              formatDateTime(opts.paidAt),
    order_id:          shortId(opts.orderId),
    card_brand:        opts.card?.brand ?? 'Card',
    card_last4:        opts.card?.last4 ?? '••••',
    tip_context:       tipContext,
    tip_message_label: opts.message ? `Note: "${opts.message.slice(0, 60)}"` : '',
    action_url:        opts.postId ? `${APP}/posts/${opts.postId}` : `${APP}/${opts.creatorUsername}`,
  })
}

export async function sendRefundIssued(opts: {
  fanUserId:        string
  fanEmail:         string
  fanDisplayName:   string | null
  fanUsername:      string
  refundAmountUsd:  number
  card?:            CardInfo | null
  originalPurchase: string
  originalAmountUsd: number
  originalOrderId:  string
  originalDate:     Date | string
  refundDate:       Date | string
  refundId:         string
  refundReason:     string
}): Promise<void> {
  if (!(await shouldSend(opts.fanEmail, opts.fanUserId, 'payment_receipts'))) return
  await sendTemplate(opts.fanEmail, '16-refund-issued', {
    first_name:        greetingName(opts.fanDisplayName, opts.fanUsername, opts.fanEmail),
    refund_amount:     usd(opts.refundAmountUsd),
    card_brand:        opts.card?.brand ?? 'Card',
    card_last4:        opts.card?.last4 ?? '••••',
    original_purchase: opts.originalPurchase,
    original_amount:   usd(opts.originalAmountUsd),
    original_order_id: shortId(opts.originalOrderId),
    original_date:     formatDate(opts.originalDate),
    refund_date:       formatDate(opts.refundDate),
    refund_id:         shortId(opts.refundId),
    refund_reason:     opts.refundReason,
  })
}

// ─── Payouts (28, 29) ────────────────────────────────────────────────────────

export async function sendPayoutSent(opts: {
  creatorUserId:      string
  creatorEmail:       string
  creatorDisplayName: string | null
  creatorUsername:    string
  payoutAmountUsd:    number
  periodStart:        Date | string
  periodEnd:          Date | string
  arrivalDate:        Date | string
  subCount:           number
  subTotalUsd:        number
  ppvCount:           number
  ppvTotalUsd:        number
  tipCount:           number
  tipTotalUsd:        number
  refundTotalUsd:     number
  bankName:           string
  bankLast4:          string
  payoutId:           string
  statementUrl?:      string
}): Promise<void> {
  if (!(await shouldSend(opts.creatorEmail, opts.creatorUserId, 'payment_receipts'))) return
  await sendTemplate(opts.creatorEmail, '28-payout-sent', {
    first_name:     greetingName(opts.creatorDisplayName, opts.creatorUsername, opts.creatorEmail),
    payout_amount:  usd(opts.payoutAmountUsd),
    period_start:   formatDate(opts.periodStart),
    period_end:     formatDate(opts.periodEnd),
    arrival_date:   formatDate(opts.arrivalDate),
    sub_count:      opts.subCount,
    sub_total:      usd(opts.subTotalUsd),
    ppv_count:      opts.ppvCount,
    ppv_total:      usd(opts.ppvTotalUsd),
    tip_count:      opts.tipCount,
    tip_total:      usd(opts.tipTotalUsd),
    refund_total:   usd(opts.refundTotalUsd),
    bank_name:      opts.bankName,
    bank_last4:     opts.bankLast4,
    payout_id:      shortId(opts.payoutId),
    action_url:     `${APP}/dashboard`,
    statement_url:  opts.statementUrl ?? `${APP}/dashboard`,
  })
}

export async function sendPayoutFailed(opts: {
  creatorUserId:      string
  creatorEmail:       string
  creatorDisplayName: string | null
  creatorUsername:    string
  payoutAmountUsd:    number
  failureReason:      string
  bankName:           string
  bankLast4:          string
  payoutId:           string
  attemptedAt:        Date | string
}): Promise<void> {
  if (!(await shouldSend(opts.creatorEmail, opts.creatorUserId, 'payment_alerts'))) return
  await sendTemplate(opts.creatorEmail, '29-payout-failed', {
    first_name:     greetingName(opts.creatorDisplayName, opts.creatorUsername, opts.creatorEmail),
    payout_amount:  usd(opts.payoutAmountUsd),
    failure_reason: opts.failureReason,
    when:           formatDateTime(opts.attemptedAt),
    bank_name:      opts.bankName,
    bank_last4:     opts.bankLast4,
    payout_id:      shortId(opts.payoutId),
    action_url:     `${APP}/dashboard/connect`,
  })
}
