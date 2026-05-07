-- ── Email preferences + suppressions ────────────────────────────────────────
-- Per-user toggles for the non-transactional email categories, plus a global
-- suppression list driven by Resend bounce/complaint webhooks.
--
-- Categories that are NOT user-toggleable (security, payment receipts, payment
-- alerts) live in code only — the gate in lib/email.ts treats them as always
-- enabled and only consults this table for the rest.

create table if not exists email_preferences (
  user_id                  uuid primary key references profiles(id) on delete cascade,
  -- Toggleable categories. Defaults match what the gate falls back to when
  -- no row exists, so a user without a row receives the same emails as a
  -- user with a freshly-defaulted row.
  creator_activity         boolean not null default true,
  creator_milestones       boolean not null default true,
  creator_summary_monthly  boolean not null default true,
  fan_activity             boolean not null default true,
  fan_summary_monthly      boolean not null default true,
  direct_messages          boolean not null default true,
  -- Marketing — opt-IN per CAN-SPAM / GDPR.
  product_updates          boolean not null default false,
  inactive_nudge           boolean not null default false,
  updated_at               timestamptz not null default now()
);

alter table email_preferences enable row level security;

drop policy if exists "Users view own email preferences" on email_preferences;
create policy "Users view own email preferences"
  on email_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own email preferences" on email_preferences;
create policy "Users insert own email preferences"
  on email_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own email preferences" on email_preferences;
create policy "Users update own email preferences"
  on email_preferences for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Suppression list (bounces, complaints, manual) ──────────────────────────
-- Email is always stored lowercased so PK lookup is case-insensitive without
-- functional indexes. Writes only happen via the service role (Resend webhook
-- + admin actions) — no insert/update policy is intentionally provided.

create table if not exists email_suppressions (
  email      text primary key,
  reason     text not null check (reason in ('bounce', 'complaint', 'manual')),
  detail     text,
  created_at timestamptz not null default now()
);

alter table email_suppressions enable row level security;
-- No SELECT policy: this table is admin/service-role only.
