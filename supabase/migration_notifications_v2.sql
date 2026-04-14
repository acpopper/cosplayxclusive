-- Notification system v2: grouped/stacked notifications, milestones
-- Run AFTER migration_notifications.sql

-- Add group_key for Instagram-style stacking (null = ungrouped, e.g. milestones/subscriber)
alter table notifications
  add column if not exists group_key text,
  add column if not exists last_activity_at timestamptz not null default now();

-- Unique index: one stacked notification per (creator, group)
-- group_key format: 'post_liked:{post_id}', 'post_commented:{post_id}', 'post_tipped:{post_id}'
create unique index if not exists notifications_user_group_key_idx
  on notifications (user_id, group_key)
  where group_key is not null;

-- Index for ordering by last activity (nav bell sorts by this)
create index if not exists notifications_user_activity_idx
  on notifications (user_id, last_activity_at desc)
  where read_at is null;
