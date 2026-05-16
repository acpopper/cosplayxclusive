-- Webhook idempotency guard. Stripe can deliver the same event more than once
-- (retries on 5xx, multiple subscribers in the Dashboard, local `stripe
-- listen` processes overlapping). The handler in lib/stripe-webhook-handler.ts
-- claims event.id here before doing side effects; a unique violation means
-- we've already processed that event and the handler returns early.
--
-- Service-role only; no RLS policy needed because the webhook handler runs
-- via the service client and nothing else writes here.

create table if not exists processed_stripe_events (
  event_id     text        primary key,
  processed_at timestamptz not null default now()
);
