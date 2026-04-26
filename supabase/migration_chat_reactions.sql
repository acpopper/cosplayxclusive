-- Chat reactions: per-message likes + replies.
-- Run AFTER migration_chat.sql / migration_chat_media.sql.

-- ── Replies ─────────────────────────────────────────────────────────────────
alter table messages
  add column if not exists reply_to_id uuid references messages(id) on delete set null;

create index if not exists messages_reply_to_idx
  on messages (reply_to_id)
  where reply_to_id is not null;

-- ── Likes ───────────────────────────────────────────────────────────────────
create table if not exists message_likes (
  message_id uuid not null references messages(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_likes_message_idx on message_likes (message_id);

alter table message_likes enable row level security;

drop policy if exists "message_likes_select" on message_likes;
drop policy if exists "message_likes_insert" on message_likes;
drop policy if exists "message_likes_delete" on message_likes;

-- Anyone who can see the parent message can see its likes.
create policy "message_likes_select" on message_likes
  for select using (
    message_id in (
      select m.id from messages m
      join conversations c on c.id = m.conversation_id
      where c.participant_a = auth.uid() or c.participant_b = auth.uid()
    )
  );

-- Only your own likes, only on messages in conversations you participate in.
create policy "message_likes_insert" on message_likes
  for insert with check (
    user_id = auth.uid() and
    message_id in (
      select m.id from messages m
      join conversations c on c.id = m.conversation_id
      where c.participant_a = auth.uid() or c.participant_b = auth.uid()
    )
  );

create policy "message_likes_delete" on message_likes
  for delete using (user_id = auth.uid());

-- Realtime so likes from the other participant appear without refresh.
alter publication supabase_realtime add table message_likes;
