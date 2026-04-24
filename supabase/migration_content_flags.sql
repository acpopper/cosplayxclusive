-- ── Image content flag detections ────────────────────────────────────────────
-- Stores every image that triggered a SightEngine nudity detection above
-- threshold. Admins review these in /admin/moderation/media-flags.

create table if not exists image_content_flags (
  id                 uuid        primary key default gen_random_uuid(),
  -- 'post' or 'auto_message'
  source_type        text        not null check (source_type in ('post', 'auto_message')),
  -- uuid of the post (nullable — set after post is inserted; null for auto_message)
  post_id            uuid        references posts(id) on delete cascade,
  creator_id         uuid        not null references profiles(id) on delete cascade,
  -- where the image lives in Supabase Storage
  storage_bucket     text        not null,
  storage_path       text        not null,
  -- blurred preview path in the public 'previews' bucket (for posts only)
  preview_path       text,
  -- e.g. ['nudity:sexual_activity', 'nudity:erotica']
  flagged_categories text[]      not null default '{}',
  -- highest score among the flagged categories (for sorting)
  max_score          float       not null default 0,
  -- full SightEngine response scores stored for audit
  detection_scores   jsonb       not null default '{}',
  resolved_at        timestamptz,
  resolved_by        uuid        references profiles(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists icf_created_at_idx
  on image_content_flags (created_at desc);

create index if not exists icf_creator_idx
  on image_content_flags (creator_id, created_at desc);

create index if not exists icf_unresolved_idx
  on image_content_flags (created_at desc)
  where resolved_at is null;

-- ── RLS — admin-only ──────────────────────────────────────────────────────────
alter table image_content_flags enable row level security;

drop policy if exists "icf_admin_all" on image_content_flags;

create policy "icf_admin_all" on image_content_flags
  for all
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
