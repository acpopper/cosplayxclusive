-- Stripe Connect: capability flags synced from account.updated webhook events.
-- These mirror the Stripe Account object so we don't have to call
-- stripe.accounts.retrieve() on every dashboard render.

alter table profiles
  add column if not exists stripe_charges_enabled   boolean not null default false,
  add column if not exists stripe_payouts_enabled   boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false;

create index if not exists profiles_stripe_account_id_idx
  on profiles (stripe_account_id)
  where stripe_account_id is not null;

-- Per-creator platform fee override. NULL = use DEFAULT_STRIPE_FEE env var.
-- Stored as a percentage 0–100 with two decimal places (e.g. 17.50 = 17.5%).
alter table profiles
  add column if not exists platform_fee_percent numeric(5,2)
    check (platform_fee_percent is null or (platform_fee_percent >= 0 and platform_fee_percent <= 100));
