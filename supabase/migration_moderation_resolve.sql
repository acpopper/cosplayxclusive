-- ── Resolution state for admin moderation queues ────────────────────────────
-- Adds resolved_at / resolved_by so admins can close out reports and flagged
-- chats without deleting the audit trail.

alter table post_reports
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references profiles(id) on delete set null;

alter table flagged_messages
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references profiles(id) on delete set null;

create index if not exists post_reports_unresolved_idx
  on post_reports (created_at desc)
  where resolved_at is null;

create index if not exists flagged_messages_unresolved_idx
  on flagged_messages (conversation_id, created_at desc)
  where resolved_at is null;
