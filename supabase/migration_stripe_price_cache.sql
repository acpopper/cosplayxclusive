-- Cache the Stripe Price ID per creator so /api/checkout/subscribe doesn't
-- create a fresh Price+Product on every subscription attempt. Prices live on
-- the creator's connected account, so this column references an object on
-- the *creator's* Stripe account (not the platform).
--
-- We also store the cents amount the cached Price was created with. When the
-- creator changes subscription_price_usd, the cents won't match and the next
-- subscribe call creates a new Price + refreshes both columns.

alter table profiles
  add column if not exists stripe_price_id           text,
  add column if not exists stripe_price_amount_cents integer
    check (stripe_price_amount_cents is null or stripe_price_amount_cents >= 0);
