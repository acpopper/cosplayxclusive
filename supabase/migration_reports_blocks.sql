-- ── Reports + user blocks ────────────────────────────────────────────────────
-- Lets users report posts (with a reason) and block other users. Blocking is
-- enforced at the DB layer so direct client inserts can't bypass it.

-- =====================
-- 1. post_reports
-- =====================
create table if not exists post_reports (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reason      text not null check (reason in ('violence', 'nudity', 'underage', 'hate', 'spam', 'other')),
  details     text,
  created_at  timestamptz not null default now(),
  unique (post_id, reporter_id)
);

create index if not exists post_reports_post_idx       on post_reports (post_id);
create index if not exists post_reports_created_at_idx on post_reports (created_at desc);

-- =====================
-- 2. user_blocks
-- =====================
create table if not exists user_blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on user_blocks (blocked_id);

-- =====================
-- 3. Block-aware message insert trigger
-- Prevents new messages when either direction of block exists between the
-- sender and the other participant of the conversation.
-- =====================
create or replace function enforce_message_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
begin
  select case
           when participant_a = NEW.sender_id then participant_b
           else participant_a
         end
  into v_other
  from conversations
  where id = NEW.conversation_id;

  if v_other is null then
    return NEW;
  end if;

  if exists (
    select 1 from user_blocks
    where (blocker_id = NEW.sender_id and blocked_id = v_other)
       or (blocker_id = v_other       and blocked_id = NEW.sender_id)
  ) then
    raise exception 'Cannot send message: a block exists between these users.'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$;

drop trigger if exists messages_block_guard on messages;
create trigger messages_block_guard
  before insert on messages
  for each row execute function enforce_message_block();

-- =====================
-- 4. RLS
-- =====================
alter table post_reports enable row level security;
alter table user_blocks  enable row level security;

drop policy if exists "post_reports_self_insert"   on post_reports;
drop policy if exists "post_reports_admin_select"  on post_reports;
drop policy if exists "user_blocks_self_all"       on user_blocks;
drop policy if exists "user_blocks_blocked_read"   on user_blocks;

create policy "post_reports_self_insert" on post_reports
  for insert with check (reporter_id = auth.uid());

create policy "post_reports_admin_select" on post_reports
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Users can see and manage only their own blocks.
create policy "user_blocks_self_all" on user_blocks
  for all
  using      (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());
