-- Add published flag to posts
-- Existing posts default to published = true so nothing breaks.
alter table posts
  add column if not exists published boolean not null default true;

create index if not exists posts_creator_published_idx
  on posts (creator_id, published, published_at desc);
