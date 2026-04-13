-- Migration: Chat system + suspended creator status
-- Run this in your Supabase SQL editor

-- =====================
-- 1. Add 'suspended' to creator_status
-- Drops whatever the auto-named check constraint is, then recreates it.
-- =====================
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%creator_status%';

  if constraint_name is not null then
    execute 'alter table public.profiles drop constraint "' || constraint_name || '"';
  end if;
end;
$$;

alter table profiles
  add constraint profiles_creator_status_check
  check (creator_status in ('pending', 'approved', 'rejected', 'suspended'));

-- =====================
-- 2. Conversations table (1:1 DMs)
-- Always store participant_a < participant_b (normalized by API)
-- =====================
create table if not exists conversations (
  id            uuid primary key default gen_random_uuid(),
  participant_a uuid not null references profiles(id) on delete cascade,
  participant_b uuid not null references profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  -- Enforce lexicographic ordering so (a,b) is always unique
  constraint conversations_ordered check (participant_a::text < participant_b::text),
  constraint conversations_pair_unique unique (participant_a, participant_b)
);

-- =====================
-- 3. Messages table
-- =====================
create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references profiles(id) on delete cascade,
  body            text not null check (char_length(trim(body)) > 0),
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on messages (conversation_id, created_at);

-- =====================
-- 4. Row Level Security
-- =====================
alter table conversations enable row level security;
alter table messages enable row level security;

-- Drop policies first in case this migration is re-run
drop policy if exists "conversations_participant_select" on conversations;
drop policy if exists "conversations_participant_insert" on conversations;
drop policy if exists "messages_participant_select" on messages;
drop policy if exists "messages_participant_insert" on messages;

-- Conversations: only participants can see/create
create policy "conversations_participant_select" on conversations
  for select using (auth.uid() = participant_a or auth.uid() = participant_b);

create policy "conversations_participant_insert" on conversations
  for insert with check (auth.uid() = participant_a or auth.uid() = participant_b);

-- Messages: only participants of the parent conversation
create policy "messages_participant_select" on messages
  for select using (
    conversation_id in (
      select id from conversations
      where participant_a = auth.uid() or participant_b = auth.uid()
    )
  );

create policy "messages_participant_insert" on messages
  for insert with check (
    sender_id = auth.uid() and
    conversation_id in (
      select id from conversations
      where participant_a = auth.uid() or participant_b = auth.uid()
    )
  );

-- =====================
-- 5. Enable Realtime for messages
-- =====================
alter publication supabase_realtime add table messages;
