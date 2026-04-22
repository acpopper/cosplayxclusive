-- ── Moderation: warning word list + flagged messages ─────────────────────────
-- Admins maintain a list of words/phrases/regex. New messages are scanned on
-- insert and any matches are recorded in flagged_messages for admin review.

-- =====================
-- 1. moderation_rules
-- =====================
create table if not exists moderation_rules (
  id         uuid primary key default gen_random_uuid(),
  pattern    text not null check (char_length(trim(pattern)) > 0),
  is_regex   boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists moderation_rules_created_at_idx
  on moderation_rules (created_at desc);

-- =====================
-- 2. flagged_messages
-- =====================
create table if not exists flagged_messages (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references messages(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  rule_id         uuid references moderation_rules(id) on delete set null,
  -- Preserve the pattern even if the rule is later deleted
  matched_pattern text not null,
  created_at      timestamptz not null default now(),
  unique (message_id, rule_id)
);

create index if not exists flagged_messages_conversation_idx
  on flagged_messages (conversation_id, created_at desc);

create index if not exists flagged_messages_created_at_idx
  on flagged_messages (created_at desc);

-- =====================
-- 3. Trigger: scan new messages
-- =====================
create or replace function scan_message_for_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  is_match boolean;
begin
  for r in select id, pattern, is_regex from moderation_rules loop
    begin
      if r.is_regex then
        is_match := NEW.body ~* r.pattern;
      else
        is_match := position(lower(r.pattern) in lower(NEW.body)) > 0;
      end if;
    exception when others then
      -- A malformed regex must not break message sends.
      is_match := false;
    end;

    if is_match then
      insert into flagged_messages (message_id, conversation_id, rule_id, matched_pattern)
      values (NEW.id, NEW.conversation_id, r.id, r.pattern)
      on conflict (message_id, rule_id) do nothing;
    end if;
  end loop;

  return NEW;
end;
$$;

drop trigger if exists messages_moderation_scan on messages;
create trigger messages_moderation_scan
  after insert on messages
  for each row execute function scan_message_for_moderation();

-- =====================
-- 4. RLS — admin only
-- =====================
alter table moderation_rules  enable row level security;
alter table flagged_messages  enable row level security;

drop policy if exists "moderation_rules_admin_all"   on moderation_rules;
drop policy if exists "flagged_messages_admin_read"  on flagged_messages;

create policy "moderation_rules_admin_all" on moderation_rules
  for all
  using      (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "flagged_messages_admin_read" on flagged_messages
  for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
