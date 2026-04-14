-- Messaging v2: auto-messages + media in chat
-- Run AFTER migration_chat.sql

-- ── Add media_paths to messages ───────────────────────────────────────────────
-- Paths in the public 'previews' bucket under 'chat-media/{creatorId}/'
alter table messages
  add column if not exists media_paths text[] not null default '{}';

-- ── Creator auto-message configuration ───────────────────────────────────────
-- One row per creator. null text = auto-message disabled for that event.
create table if not exists creator_automessages (
  creator_id            uuid primary key references profiles(id) on delete cascade,
  new_sub_text          text,
  new_sub_media         text[] not null default '{}',   -- paths in previews/chat-media/
  returning_sub_text    text,
  returning_sub_media   text[] not null default '{}',
  updated_at            timestamptz not null default now()
);

alter table creator_automessages enable row level security;

-- Creators can read/write their own config
drop policy if exists "automsg_own" on creator_automessages;
create policy "automsg_own" on creator_automessages
  for all using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

-- Service role reads everything (for auto-send logic)
-- (service role bypasses RLS entirely — no policy needed)
