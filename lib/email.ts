import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/server'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = process.env.RESEND_FROM ?? 'CosplayXclusive <noreply@cosplayxclusive.com>'
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

// ─── shared layout ───────────────────────────────────────────────────────────
function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:32px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%">
        <!-- Header -->
        <tr>
          <td style="background:#e0407a;padding:24px 32px">
            <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:-0.5px">CosplayXclusive</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 24px">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #eeeeee">
            <p style="margin:0;font-size:12px;color:#999999">
              You&rsquo;re receiving this because you have an account on
              <a href="${APP}" style="color:#e0407a;text-decoration:none">CosplayXclusive</a>.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#e0407a;color:#ffffff;border-radius:8px;font-size:14px;font-weight:bold;text-decoration:none">${label}</a>`
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;font-size:15px;color:#333333;line-height:1.6">${text}</p>`
}

function h(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:22px;font-weight:bold;color:#111111">${text}</h1>`
}

// ─── email senders ────────────────────────────────────────────────────────────

/** Sent when admin approves a creator application. */
export async function sendCreatorApproved(userId: string, toEmail: string, username: string) {
  if (!(await shouldSend(toEmail, userId, 'account_security'))) return
  await resend.emails.send({
    from:    FROM,
    to:      toEmail,
    subject: 'Your creator application was approved! 🎉',
    html:    layout('Application approved', `
      ${h('You\'re in!')}
      ${p(`Congratulations, <strong>@${username}</strong>! Your creator application on CosplayXclusive has been <strong>approved</strong>.`)}
      ${p('You can now publish exclusive content, set subscription prices, and start earning from your fans.')}
      ${btn(`${APP}/dashboard`, 'Go to your dashboard')}
    `),
  }).catch(() => {/* fire-and-forget */})
}

/** Sent when admin rejects a creator application. */
export async function sendCreatorRejected(userId: string, toEmail: string, username: string) {
  if (!(await shouldSend(toEmail, userId, 'account_security'))) return
  await resend.emails.send({
    from:    FROM,
    to:      toEmail,
    subject: 'Update on your CosplayXclusive creator application',
    html:    layout('Application update', `
      ${h('Application not approved')}
      ${p(`Hi <strong>@${username}</strong>, unfortunately your creator application was not approved at this time.`)}
      ${p('If you have questions or would like to reapply after making changes to your profile, please reach out to our support team.')}
      ${btn(`${APP}`, 'Visit CosplayXclusive')}
    `),
  }).catch(() => {/* fire-and-forget */})
}

/** Sent to a creator when they get a new subscriber. */
export async function sendNewSubscriber(
  userId:          string,
  toEmail:         string,
  creatorUsername: string,
  fanName:         string,
  isPaid:          boolean,
) {
  if (!(await shouldSend(toEmail, userId, 'creator_activity'))) return
  const subType = isPaid ? 'paid subscriber' : 'free follower'
  await resend.emails.send({
    from:    FROM,
    to:      toEmail,
    subject: `${fanName} just ${isPaid ? 'subscribed' : 'followed'} you!`,
    html:    layout('New subscriber', `
      ${h('You have a new ${subType}!')}
      ${p(`<strong>${fanName}</strong> just became your new ${subType} on CosplayXclusive.`)}
      ${isPaid ? p('Keep posting great content to keep them subscribed.') : ''}
      ${btn(`${APP}/dashboard`, 'View your dashboard')}
    `),
  }).catch(() => {/* fire-and-forget */})
}

/** Sent to a creator when their post gets its first comment (then grouped). */
export async function sendNewComment(
  userId:          string,
  toEmail:         string,
  creatorUsername: string,
  commenterName:   string,
  postCaption:     string | null,
  commentBody:     string,
) {
  if (!(await shouldSend(toEmail, userId, 'creator_activity'))) return
  const postRef = postCaption ? `"${postCaption.slice(0, 60)}${postCaption.length > 60 ? '…' : ''}"` : 'your post'
  await resend.emails.send({
    from:    FROM,
    to:      toEmail,
    subject: `${commenterName} commented on ${postRef}`,
    html:    layout('New comment', `
      ${h('Someone commented on your post')}
      ${p(`<strong>${commenterName}</strong> left a comment on ${postRef}:`)}
      <blockquote style="margin:16px 0;padding:12px 16px;background:#f9f9f9;border-left:3px solid #e0407a;border-radius:4px;font-size:14px;color:#444444;font-style:italic">
        &ldquo;${commentBody.slice(0, 200)}${commentBody.length > 200 ? '…' : ''}&rdquo;
      </blockquote>
      ${btn(`${APP}/${creatorUsername}`, 'See the post')}
    `),
  }).catch(() => {/* fire-and-forget */})
}

/** Sent to a creator when their post receives a tip. */
export async function sendNewTip(
  userId:          string,
  toEmail:         string,
  creatorUsername: string,
  tipperName:      string,
  amount:          number,
  postCaption:     string | null,
) {
  if (!(await shouldSend(toEmail, userId, 'creator_activity'))) return
  const postRef = postCaption ? `"${postCaption.slice(0, 60)}${postCaption.length > 60 ? '…' : ''}"` : 'your post'
  await resend.emails.send({
    from:    FROM,
    to:      toEmail,
    subject: `${tipperName} sent you a $${amount.toFixed(2)} tip! 💰`,
    html:    layout('New tip', `
      ${h('You received a tip!')}
      ${p(`<strong>${tipperName}</strong> sent you a <strong>$${amount.toFixed(2)} tip</strong> on ${postRef}.`)}
      ${p('Tips are paid out along with your regular earnings.')}
      ${btn(`${APP}/dashboard`, 'View your earnings')}
    `),
  }).catch(() => {/* fire-and-forget */})
}
