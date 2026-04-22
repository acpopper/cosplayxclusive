# CosplayXclusive — Product Spec

A platform built exclusively for cosplayers to share content, grow a
subscriber base, and earn directly from their audience. This document is the
living product spec — it reflects what's actually shipped rather than a
forward-looking wish list. Update it when features change.

## Product goals

- Give cosplayers a clean home for exclusive photo and video content.
- Support three access tiers per post: free, subscriber-only, pay-per-view.
- Let creators monetise via monthly subscriptions, PPV unlocks, and tips.
- Keep the app feeling premium, mobile-first, and fast.
- Provide admins enough tooling to vet creators and moderate chat/content.

## Tech stack

| Layer    | Choice                                                    |
| -------- | --------------------------------------------------------- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript             |
| Styling  | Tailwind CSS v4, custom design tokens                     |
| Auth/DB  | Supabase (Postgres + Auth + Storage + Realtime)           |
| Payments | Stripe Checkout (subscriptions + PPV) + Stripe Connect    |
| Media    | Supabase Storage (private `originals` + public `previews`), sharp-based server-side watermarking & blurring |
| Hosting  | Vercel                                                    |

## User roles

Roles are merged into a single `user` role (see
`supabase/migration_merge_roles.sql`). Creator status is tracked separately
on the profile via `creator_status`:

- `null` — regular user (default for every signup).
- `pending` — applied to become a creator, awaiting admin review.
- `approved` — active creator; can publish paid content and receive payouts.
- `rejected` — application was declined.
- `suspended` — admin removed publishing rights.

`role` itself is `'user' | 'admin'`. Admins get access to the admin area.

## Route map

### Public

- `/` — landing page
- `/login`, `/signup`
- `/terms`, `/privacy`
- `/@:username` — creator profile (404 for non-approved creators and for
  viewers who have been blocked by that creator)

### Authenticated

- `/onboarding` — post-signup profile setup
- `/home` — subscribed feed (only creators you follow/subscribe to)
- `/explore` — discovery list of approved creators
- `/messages`, `/messages/:conversationId`, `/messages/new` — 1:1 DMs with
  realtime updates
- `/settings` — account (editable username / email / password), creator
  programme status, blocked accounts, legal links
- `/settings/creator-apply` — apply to become a creator

### Creator dashboard (anyone with a `creator_status`)

- `/dashboard` — overview / application status
- `/dashboard/posts`, `/dashboard/posts/new`, `/dashboard/posts/:postId/edit`
- `/dashboard/profile` — public profile editor (avatar, banner, bio, tags, price)
- `/dashboard/messaging` — auto-message configuration for new subscribers
- `/dashboard/connect` — Stripe Connect onboarding + payout status

### Admin (`role = 'admin'`)

- `/admin` → redirects to `/admin/creators`
- `/admin/creators` — creator applications list (pending / approved / suspended / rejected) with approve/reject/suspend actions
- `/admin/moderation/words` — warning-word/regex patterns that auto-flag matching chat messages
- `/admin/moderation/flagged` — conversations containing flagged messages
- `/admin/moderation/flagged/:conversationId` — read-only chat viewer with flagged lines highlighted
- `/admin/moderation/reports` — user-submitted post reports grouped by post

## Feature summary

### Authentication & onboarding
- Email + password via Supabase Auth. On signup the app checks username
  uniqueness before calling `auth.signUp` so the profile trigger can't
  collide.
- `/onboarding` captures the first-run profile details.
- All sensitive routes redirect to `/login` when unauthenticated.

### Creator profiles
- Avatar, banner, display name, username, bio, fandom tags, subscription price.
- Public `/@username` page renders posts with locked previews for content
  the viewer can't access, subscribe/PPV CTAs, a message button (admins
  always; followers/subscribers otherwise), and a kebab menu with
  **Block user** (logged-in non-admin viewers only).
- Restricted profile view when the viewer has blocked the creator: only
  avatar/banner/name + unblock CTA.

### Posts
- Multi-media: images and videos on the same post.
- Access types: `free`, `subscriber_only`, `ppv` (price per post).
- Upload pipeline: signed upload URLs → server-side watermarking and
  blurred preview generation via `sharp` → originals in private
  `originals` bucket, previews in public `previews` bucket.
- Backend gates access before handing out signed URLs; the client never
  receives URLs for content it isn't entitled to.
- Social: likes, comments, tips (Stripe).
- Every post card has a kebab menu with **Report post** (modal with
  categorised reasons: violence, nudity, underage, hate, spam, other).

### Feed
- `/home` is a personalised feed of the viewer's active subscriptions,
  newest first. Excludes posts from anyone in a block relationship
  (either direction).

### Subscriptions & PPV
- Stripe Checkout for monthly subscriptions (including $0 "free follow" tier).
- Stripe Checkout for one-off PPV unlocks.
- Stripe webhooks sync subscription status, period ends, and PPV purchase
  records.
- Creators onboard to Stripe Connect Express to receive payouts.

### Messaging
- 1:1 conversations with Supabase Realtime streaming new messages.
- Participants normalized (`participant_a < participant_b`) to keep pairs
  unique.
- Image attachments supported via the public `previews` bucket (used by
  auto-messages today).
- Auto-messages: creators can configure a welcome DM that fires when a new
  fan subscribes.
- Read receipts per user via `conversation_reads`.
- Admin badge rendered in chat for admin senders.

### Notifications
- In-app bell shows recent activity for approved creators and admins:
  new subscribers, likes / comments / tips on your posts, milestone
  achievements, etc. Stored in `notifications` with a `group_key` for
  stacking (see `migration_notifications_v2.sql`).

### Moderation (admin)
- **Warning patterns** — admins add plain substrings or regex; a Postgres
  `AFTER INSERT` trigger on `messages` scans each new message and records
  matches in `flagged_messages`. A bad regex is caught in plpgsql and
  ignored so it can never break chat sends.
- **Flagged chats** — admins see conversations with matches, with a
  read-only viewer that highlights the offending messages.
- **Reports** — users report posts with a reason; admin sees grouped
  reports with reporter, reason, details, and post preview.
- **Block enforcement** — a `BEFORE INSERT` trigger on `messages` raises
  when a block exists between sender and the other participant, catching
  direct client inserts. `/api/messages/start` short-circuits the same
  check before inserting.

### Safety & blocking
- Users block from the profile kebab menu. Blocks are directional in
  the table but enforced symmetrically in the app:
  - Viewer sees restricted view of blocked creator; blocked party sees
    404 for the blocker.
  - Feed excludes blocked creators either way.
  - Neither party can DM the other (API + DB trigger).
- **Settings → Blocked accounts** lists every user you've blocked with
  inline unblock.

## Database schema overview

Core tables (`supabase/schema.sql`):
- `profiles` — user identity + creator fields + creator status
- `posts` — media paths, access type, price, published flag
- `subscriptions`, `post_purchases`, `transactions` — payments

Feature migrations (`supabase/migration_*.sql`):
- `migration_merge_roles.sql` — collapses fan/creator into `user`, adds
  `creator_application` / `creator_applied_at`
- `migration_chat.sql` — `conversations`, `messages`, realtime
- `migration_notifications.sql` + `_v2` — `notifications`, `conversation_reads`, stacking
- `migration_feed.sql` — `post_likes`, `post_comments`, `post_tips`
- `migration_messaging.sql` — `creator_automessages`
- `migration_posts_publish.sql` — draft/publish flag on posts
- `migration_moderation.sql` — `moderation_rules`, `flagged_messages`,
  scan trigger on messages
- `migration_reports_blocks.sql` — `post_reports`, `user_blocks`, block
  guard trigger on messages

All migrations are idempotent — safe to re-run.

## Security model

- RLS enabled on every user-writable table. Admin-only tables
  (`moderation_rules`, `flagged_messages`, `post_reports` select) use an
  `exists (…profiles.role = 'admin')` policy.
- Server routes use the service role client only after verifying the
  caller's session and privilege level.
- Private media lives in the `originals` bucket and is only ever served
  via short-lived signed URLs generated server-side after access checks.
- Stripe webhook signatures are verified; no client-trusted price data.
- Password changes require re-authentication with the current password.
- Block/moderation triggers run `security definer` with `search_path = public`.

## Design direction

- Mobile-first, dark theme, modern, premium feel.
- Cards, soft gradients, subtle accent glow on CTAs.
- Copy rule: describe the product on its own terms — no competitor
  name-drops, no positioning as an "adult content" platform.

## Deployment notes

- `.env.local.example` lists the required env vars (Supabase URL + anon
  key + service role key, Stripe secret + publishable + webhook secret,
  `NEXT_PUBLIC_APP_URL`).
- Deploy to Vercel; Supabase Storage buckets `originals` (private) and
  `previews` (public) must be created with the project.
- Run migrations in numeric/feature order after `schema.sql`.
- Stripe Connect Express must be enabled in the Stripe dashboard for
  creator payouts.
