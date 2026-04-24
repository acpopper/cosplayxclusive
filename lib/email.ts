import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM   = process.env.RESEND_FROM ?? 'CosplayXclusive <noreply@cosplayxclusive.com>'
const APP    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cosplayxclusive.com'

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
export async function sendCreatorApproved(toEmail: string, username: string) {
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
export async function sendCreatorRejected(toEmail: string, username: string) {
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
  toEmail:         string,
  creatorUsername: string,
  fanName:         string,
  isPaid:          boolean,
) {
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
  toEmail:         string,
  creatorUsername: string,
  commenterName:   string,
  postCaption:     string | null,
  commentBody:     string,
) {
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
  toEmail:         string,
  creatorUsername: string,
  tipperName:      string,
  amount:          number,
  postCaption:     string | null,
) {
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
