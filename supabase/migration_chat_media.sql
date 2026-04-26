-- Chat media: allow creators to send images in DMs.
-- Run AFTER migration_messaging.sql and migration_content_flags.sql.

-- ── Relax messages.body check ───────────────────────────────────────────────
-- A message is now valid if it has either a non-empty body OR at least one
-- image attachment. The original constraint name is auto-generated; locate
-- and drop whatever exists.
do $$
declare
  cn text;
begin
  for cn in
    select conname
    from pg_constraint
    where conrelid = 'public.messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%char_length%body%'
  loop
    execute format('alter table public.messages drop constraint %I', cn);
  end loop;
end;
$$;

alter table messages
  add constraint messages_body_or_media_check
  check (char_length(trim(body)) > 0 or coalesce(array_length(media_paths, 1), 0) > 0);

-- ── Extend image_content_flags.source_type to include 'message' ─────────────
do $$
declare
  cn text;
begin
  for cn in
    select conname
    from pg_constraint
    where conrelid = 'public.image_content_flags'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source_type%'
  loop
    execute format('alter table public.image_content_flags drop constraint %I', cn);
  end loop;
end;
$$;

alter table image_content_flags
  add constraint image_content_flags_source_type_check
  check (source_type in ('post', 'auto_message', 'message'));
