You are my senior full-stack engineer. Build a FAST MVP for a niche creator platform called “CosplayXclusive”, inspired by OnlyFans/Arsmate but focused on cosplay creators only.

Your goal is NOT to build the full product spec. Your goal is to ship the smallest production-ready MVP that can validate whether cosplay creators and fans will use and pay for it.

IMPORTANT PRODUCT STRATEGY:

- This is a niche paid content platform for cosplay creators.
- We are validating creator onboarding, paid subscriptions, PPV content, and basic paywall access.
- We are NOT building a full social network.
- We are optimizing for speed, simplicity, and a clean codebase that can be extended later.
- If something is not critical for validating paid creator monetization, exclude it.

TECH STACK:

- Next.js 14+ with App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase for Auth, Postgres, Storage
- Stripe + Stripe Connect Express
- Vercel-ready deployment
- Minimal email support only if necessary
- Clean, modular architecture

DESIGN DIRECTION:

- Mobile-first
- Dark, modern, premium, anime/cosplay-inspired aesthetic
- Not tacky, not porn-site-looking
- More “premium creator platform” than “cheap adult site”
- Use clean cards, soft gradients, subtle glow accents, strong CTAs
- The UI should feel launchable, not like an admin prototype

BUILD ONLY THIS MVP SCOPE:

1. AUTHENTICATION

- Fan and Creator accounts
- Email/password auth with Supabase
- Google login optional if quick to add, otherwise skip for now
- Protected app routes
- Minimal onboarding:
  - fan: username
  - creator: username, display name, bio, fandom tags
- Do NOT implement complex role flows beyond what is needed

2. CREATOR PROFILES

- Public creator profile page at /@username
- Show:
  - avatar
  - banner
  - display name
  - bio
  - fandom tags
  - subscription price
  - grid of posts
- If viewer is not subscribed, subscriber-only and PPV posts must show blurred preview + CTA
- Keep profile editing simple

3. CONTENT POSTS

- Creators can create posts with:
  - optional caption
  - one or more IMAGES only
  - access type:
    - free
    - subscriber_only
    - ppv
  - optional PPV price if ppv
- For MVP, support images only
- Skip video entirely for now
- Generate preview/blurred version for locked content
- Store originals privately
- Do not overengineer media processing
- Implement a simple reliable image upload pipeline first

4. PAYWALL LOGIC

- Free posts visible to all
- Subscriber-only posts visible only to active subscribers of that creator
- PPV posts visible only to users who purchased that post
- Backend must enforce access before returning original media URLs
- Locked media should always render blurred previews in UI

5. SUBSCRIPTIONS

- Each creator sets a monthly subscription price
- Fans can subscribe through Stripe Checkout
- Monthly recurring billing
- Fans can cancel subscription
- Access remains until current billing period ends
- Sync subscription state via Stripe webhooks

6. PPV PURCHASES

- Fans can unlock a single PPV post through Stripe Checkout
- On successful payment, mark purchase in DB
- Unlock content immediately after payment confirmation
- Keep this simple and robust

7. CREATOR DASHBOARD

- Creator can:
  - edit profile
  - create post
  - list own posts
  - see simple earnings summary
  - connect Stripe account
- No advanced analytics needed

8. LIGHT ADMIN

- Minimal admin route
- Admin can:
  - view creator accounts
  - approve or reject creators manually
- Nothing more
- No heavy moderation tooling in MVP

9. LANDING PAGE

- Public homepage for CosplayXclusive
- Sections:
  - hero
  - value proposition
  - for creators
  - for fans
  - CTA to join
- Make it look polished enough for launch

EXPLICITLY EXCLUDE FROM THIS MVP:

- Chat
- Likes
- Comments
- Notifications
- Feed algorithm
- Explore filters beyond a very basic creator list
- Video upload
- Live streaming
- Native mobile apps
- Advanced moderation
- Dynamic watermarking
- Multi-language
- Referral systems
- Tips/donations
- Bundles/discounted plans
- Complex analytics
- Anything not essential to monetized creator validation

DATABASE / DOMAIN MODEL:
Use a clean minimal schema with tables equivalent to:

- profiles
- creator_applications
- posts
- subscriptions
- post_purchases
- transactions

Suggested profile fields:

- id
- username
- display_name
- bio
- avatar_url
- banner_url
- role (fan | creator | admin)
- creator_status (pending | approved | rejected)
- subscription_price_usd
- fandom_tags
- stripe_customer_id
- stripe_account_id

Suggested post fields:

- id
- creator_id
- caption
- access_type (free | subscriber_only | ppv)
- price_usd
- published_at

Suggested post media structure:

- separate table if needed, or json structure if simpler
- keep it pragmatic, do not overengineer

SECURITY REQUIREMENTS:

- Use Supabase RLS where appropriate
- Originals must not be public
- Locked content must not be directly accessible
- Stripe webhook signature must be verified
- Never trust the client for access control
- Keep secrets server-side

IMPLEMENTATION PRIORITIES:
Follow this exact order and keep the app functional after each step:

PHASE 1

- Bootstrap Next.js app
- Setup Tailwind and shadcn
- Setup Supabase client/server auth
- Create DB schema and migrations
- Implement auth and protected routes
- Implement roles and basic onboarding

PHASE 2

- Implement creator profile pages
- Implement profile editing
- Implement image upload for avatars/banner/posts
- Implement post creation and listing
- Implement blurred previews for locked posts

PHASE 3

- Implement Stripe subscription checkout
- Implement Stripe Connect onboarding for creators
- Implement subscription status syncing with webhooks
- Implement paywall access checks

PHASE 4

- Implement PPV checkout and unlock flow
- Implement creator dashboard
- Implement simple earnings summary
- Implement minimal admin approval panel

PHASE 5

- Build polished public landing page
- Improve UI consistency
- Add loading states, empty states, and error handling
- Final cleanup for Vercel deployment

CODING RULES:

- Use TypeScript strictly
- Keep components modular and reusable
- Favor simple architecture over abstraction-heavy patterns
- Do not introduce unnecessary libraries
- Do not build speculative features
- Do not leave placeholder pseudo-code unless unavoidable
- Build real working flows
- If a feature is ambiguous, choose the simplest implementation that supports launch
- Prefer server-side enforcement for permissions and paid access
- Keep code production-minded but MVP-fast

OUTPUT FORMAT I WANT FROM YOU:

1. First, analyze the project and propose:
   - final MVP scope
   - DB schema
   - route map
   - implementation plan
2. Then start implementing immediately
3. Work iteratively in small safe steps
4. After each major milestone, summarize:
   - what was built
   - what remains
   - any blockers
5. If you must make product decisions, default to speed and simplicity

SUCCESS DEFINITION:
The MVP is successful if:

- creators can apply and be approved
- creators can create locked image posts
- fans can subscribe and unlock subscriber-only content
- fans can buy PPV posts
- creator profiles and landing page look polished enough to launch
- the app can be deployed to Vercel with Supabase and Stripe configured

Now begin by:

- reviewing the requested MVP critically
- shrinking anything unnecessary
- proposing the final implementation plan
- then scaffolding the app and schema
