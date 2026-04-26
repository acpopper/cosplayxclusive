-- Migration: per-user favorite conversations
-- Run after migration_chat.sql / migration_notifications.sql

create table if not exists conversation_favorites (
  user_id         uuid not null references profiles(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists conversation_favorites_user_idx
  on conversation_favorites (user_id);

alter table conversation_favorites enable row level security;

drop policy if exists "favorites_select_own" on conversation_favorites;
create policy "favorites_select_own" on conversation_favorites
  for select using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on conversation_favorites;
create policy "favorites_insert_own" on conversation_favorites
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from conversations c
      where c.id = conversation_id
        and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

drop policy if exists "favorites_delete_own" on conversation_favorites;
create policy "favorites_delete_own" on conversation_favorites
  for delete using (auth.uid() = user_id);
