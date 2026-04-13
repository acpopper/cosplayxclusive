-- Migration: Conversation reads tracking + notification system
-- Run this in your Supabase SQL editor AFTER migration_chat.sql

-- =====================
-- 1. conversation_reads
-- Tracks the last time each user read each conversation.
-- Used to compute the unread-message badge count.
-- =====================
create table if not exists conversation_reads (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table conversation_reads enable row level security;

drop policy if exists "reads_own" on conversation_reads;
create policy "reads_own" on conversation_reads
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================
-- 2. notifications
-- Stores per-user notifications (e.g. new subscriber).
-- =====================
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  type       text not null,          -- 'new_subscriber'
  payload    jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on notifications (user_id, read_at)
  where read_at is null;

alter table notifications enable row level security;

drop policy if exists "notifs_own_select" on notifications;
create policy "notifs_own_select" on notifications
  for select using (auth.uid() = user_id);

-- service role handles all inserts/updates (from API routes)
drop policy if exists "notifs_service_all" on notifications;
create policy "notifs_service_all" on notifications
  for all using (true);

-- =====================
-- 3. RPC: count conversations with unread messages
-- Returns the number of distinct conversations where the other
-- participant has sent messages newer than the user's last_read_at.
-- =====================
create or replace function count_unread_conversations()
returns integer
language sql
security invoker
stable
as $$
  select count(distinct c.id)::integer
  from conversations c
  join messages m on m.conversation_id = c.id
  left join conversation_reads cr
    on cr.conversation_id = c.id
   and cr.user_id = auth.uid()
  where (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    and m.sender_id != auth.uid()
    and (cr.last_read_at is null or m.created_at > cr.last_read_at);
$$;
