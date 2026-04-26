<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into CosplayXclusive. PostHog is now initialized client-side via `instrumentation-client.ts` (Next.js 15.3+ approach, no provider needed), with a reverse proxy configured in `next.config.ts` to route events through `/ingest` for improved reliability. A server-side client in `lib/posthog-server.ts` powers event tracking in API routes and webhooks. Environment variables are stored in `.env.local`. 12 events covering the full fan/creator journey — from signup through subscription, content creation, tipping, PPV purchases, and churn — are now tracked across 10 files.

| Event | Description | File |
|---|---|---|
| `user_signed_up` | New user completed registration | `app/signup/page.tsx` |
| `user_logged_in` | Existing user authenticated | `app/login/page.tsx` |
| `creator_application_submitted` | User submitted a creator application (new or re-apply) | `app/settings/creator-apply/form.tsx` |
| `subscription_initiated` | Fan began the subscribe flow (free or paid checkout) | `app/[username]/profile-client.tsx` |
| `subscription_cancelled` | Fan successfully cancelled their subscription | `app/api/subscriptions/cancel/route.ts` |
| `subscription_completed` | Paid subscription confirmed via Stripe webhook | `app/api/webhooks/stripe/route.ts` |
| `tip_checkout_started` | Fan selected a tip amount and was redirected to Stripe | `app/home/feed-post-card.tsx` |
| `tip_completed` | Tip payment confirmed via Stripe webhook | `app/api/webhooks/stripe/route.ts` |
| `ppv_purchased` | Pay-per-view post purchase confirmed via Stripe webhook | `app/api/webhooks/stripe/route.ts` |
| `post_created` | Creator successfully published a new post | `app/api/posts/create/route.ts` |
| `post_liked` | Fan liked or unliked a post | `app/home/feed-post-card.tsx` |
| `post_commented` | User submitted a comment on a post | `app/home/feed-post-card.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/396405/dashboard/1508394
- **Signup → Subscription Funnel**: https://us.posthog.com/project/396405/insights/lbxhdoA2
- **Subscription Churn (Cancellations)**: https://us.posthog.com/project/396405/insights/HU9si1ua
- **Revenue Events Over Time**: https://us.posthog.com/project/396405/insights/GwtOlUPp
- **Creator Applications Submitted**: https://us.posthog.com/project/396405/insights/hGhqCQo2
- **Post Engagement (Likes & Comments)**: https://us.posthog.com/project/396405/insights/a8sVSofC

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
