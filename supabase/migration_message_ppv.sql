-- ── PPV chat media ──────────────────────────────────────────────────────────
-- Creators can attach a price to chat media. Recipients see a blurred preview
-- + unlock CTA until they pay.
--
-- Storage layout when price_usd IS NOT NULL:
--   media_paths      -> blurred previews in the public 'previews' bucket
--   media_originals  -> watermarked full-res in the private 'originals' bucket
--
-- When price_usd IS NULL (free media — current behavior is preserved):
--   media_paths      -> public preview-bucket paths (as today)
--   media_originals  -> NULL or empty array

alter table messages
  add column if not exists price_usd numeric(10,2);

alter table messages
  add column if not exists media_originals text[];

-- ── message_purchases — fan unlocks one PPV message ─────────────────────────
create table if not exists message_purchases (
  id                       uuid primary key default gen_random_uuid(),
  fan_id                   uuid not null references profiles(id) on delete cascade,
  message_id               uuid not null references messages(id)  on delete cascade,
  stripe_payment_intent_id text,
  amount_usd               numeric(10,2),
  created_at               timestamptz not null default now(),
  unique (fan_id, message_id)
);

create index if not exists message_purchases_fan_idx
  on message_purchases (fan_id, created_at desc);

create index if not exists message_purchases_message_idx
  on message_purchases (message_id);

alter table message_purchases enable row level security;

drop policy if exists "Users can view own message purchases" on message_purchases;
create policy "Users can view own message purchases"
  on message_purchases for select
  using (auth.uid() = fan_id);
-- INSERTs come from the Stripe webhook via the service role, which bypasses
-- RLS — no insert policy is intentionally provided to fans.
