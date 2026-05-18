-- Per-call audit of Sightengine moderation API requests. Admins use this to
-- track how many image checks (= billable operations) we've consumed over
-- time so they can keep tabs on the Sightengine bill.
--
-- One row per image checked. The handler in lib/sightengine.ts inserts here
-- on every checkImageContent() call, regardless of whether the image was
-- flagged or not.

create table if not exists sightengine_usage (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references profiles(id) on delete set null,
  -- Where the check came from: 'post_precheck' | 'post_create' |
  -- 'message' | 'auto_message' | 'unknown'
  source      text        not null,
  -- Sightengine returns success/failure; we record the outcome so a billing
  -- audit can subtract failed calls if needed.
  succeeded   boolean     not null default false,
  -- Highest detection score we saw on this image (0–1). Useful for spot
  -- checks: a column of zeroes for hours means the model is mis-firing.
  max_score   numeric(4,3) check (max_score is null or (max_score >= 0 and max_score <= 1)),
  -- Was the image flagged at upload threshold?
  flagged     boolean     not null default false,
  bytes       integer     check (bytes is null or bytes >= 0),
  content_type text,
  created_at  timestamptz not null default now()
);

create index if not exists sightengine_usage_created_at_idx
  on sightengine_usage (created_at desc);

create index if not exists sightengine_usage_user_idx
  on sightengine_usage (user_id, created_at desc);

-- Admin-only RLS
alter table sightengine_usage enable row level security;

drop policy if exists "sightengine_usage_admin_all" on sightengine_usage;

create policy "sightengine_usage_admin_all" on sightengine_usage
  for all
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
