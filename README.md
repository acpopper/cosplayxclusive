# CosplayXclusive

A platform built exclusively for cosplayers to share content, grow a
subscriber base, and earn directly from their audience. Built with Next.js
16 (App Router), Supabase, and Stripe.

See [PRD.md](./PRD.md) for the full product spec and route map.

## Features

- **Creator programme** — apply → admin review → approved. Approved
  creators get a `/@username` profile, a dashboard, and Stripe Connect
  payouts.
- **Posts** — images and videos with free / subscriber-only / pay-per-view
  access tiers. Server-side watermarking and blurred previews for locked
  content.
- **Paywall** — monthly Stripe subscriptions and one-off PPV unlocks.
  Access is always enforced server-side before signed URLs are issued.
- **Feed, likes, comments, tips** — personalised home feed from your
  subscriptions, standard social actions, Stripe-backed tipping.
- **1:1 messaging** — realtime DMs via Supabase Realtime, optional
  creator auto-messages on subscribe.
- **Notifications** — in-app bell for subscribers, likes, comments, tips,
  and milestones.
- **Moderation** — admin dashboard with creator approvals, a warning-word
  system that auto-flags matching chat messages, a read-only flagged
  chat viewer, and a post report queue.
- **Safety** — user blocking (enforced end-to-end: feed, profile,
  messaging) and a blocked-accounts settings page.

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Supabase (Postgres, Auth, Storage, Realtime)
- Stripe Checkout + Stripe Connect Express
- `sharp` for server-side image processing
- Vercel-ready deployment

## Prerequisites

- Node.js 20+
- A Supabase project
- A Stripe account with Connect Express enabled
- `originals` (private) and `previews` (public) Storage buckets in Supabase

## Getting started

```bash
# 1. Install deps
npm install

# 2. Configure env vars
cp .env.local.example .env.local
# Then fill in the values (see below)

# 3. Run migrations in Supabase (see below)

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Copy `.env.local.example` → `.env.local` and set:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-only; never expose

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Database migrations

Run these in the Supabase SQL editor, in order. All files are idempotent.

1. `supabase/schema.sql` — base tables (profiles, posts, subscriptions,
   post_purchases, transactions)
2. `supabase/migration_merge_roles.sql` — merges fan/creator roles into a
   single `user` role; adds creator application fields
3. `supabase/migration_posts_publish.sql` — draft/publish flag on posts
4. `supabase/migration_feed.sql` — likes, comments, tips
5. `supabase/migration_chat.sql` — conversations + messages + realtime
6. `supabase/migration_messaging.sql` — creator auto-messages
7. `supabase/migration_notifications.sql` — notifications, read state
8. `supabase/migration_notifications_v2.sql` — notification stacking
9. `supabase/migration_moderation.sql` — warning patterns + flagged
   messages + scan trigger
10. `supabase/migration_reports_blocks.sql` — post reports + user blocks
    + block-guard trigger on messages

After migrations, create the Storage buckets `originals` (private) and
`previews` (public).

## Stripe setup

1. Enable **Connect Express** in the Stripe dashboard.
2. Create a webhook endpoint pointing at `/api/webhooks/stripe` and copy
   the signing secret into `STRIPE_WEBHOOK_SECRET`. Subscribe to the
   relevant `checkout.session.completed`, `customer.subscription.*`, and
   `account.updated` events.
3. For local testing, `stripe listen --forward-to
   localhost:3000/api/webhooks/stripe`.

## Scripts

```bash
npm run dev     # start local dev server
npm run build   # production build
npm run start   # run production build locally
npm run lint    # ESLint
```

## Making an admin user

There's no self-serve admin promotion — flip the flag in SQL:

```sql
update profiles set role = 'admin' where username = 'your_username';
```

Then visit `/admin`.

## Project conventions

- Server actions/APIs are under `app/api/**/route.ts`. The session user is
  checked first; privileged work uses the service-role client only after
  that check passes.
- Shared UI lives in `components/`. Page-specific client components live
  next to their page.
- Storage paths: originals in `originals/<creator>/<post>/…`, previews
  (blurred + watermarked) in `previews/<creator>/<post>/…`.
- Do not describe the product by comparing it to other platforms. Keep
  copy focused on cosplayers and the platform's own features.

## Deployment (Vercel)

1. Push to GitHub and import the repo in Vercel.
2. Set all env vars from `.env.local` in the Vercel project settings.
3. Point your Stripe webhook at `https://<your-domain>/api/webhooks/stripe`
   and update `STRIPE_WEBHOOK_SECRET` accordingly.
4. Deploy.
