-- Feed interactions: likes, comments, tips
-- Run this in your Supabase SQL editor

-- ─── post_likes ──────────────────────────────────────────────────────────────
create table if not exists post_likes (
  post_id   uuid not null references posts(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table post_likes enable row level security;

drop policy if exists "Likes visible to all authenticated users" on post_likes;
create policy "Likes visible to all authenticated users"
  on post_likes for select
  using (auth.uid() is not null);

drop policy if exists "Users can like posts" on post_likes;
create policy "Users can like posts"
  on post_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can unlike posts" on post_likes;
create policy "Users can unlike posts"
  on post_likes for delete
  using (auth.uid() = user_id);

-- ─── post_comments ───────────────────────────────────────────────────────────
create table if not exists post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  body       text not null check (char_length(body) > 0 and char_length(body) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_id_idx on post_comments(post_id, created_at);

alter table post_comments enable row level security;

drop policy if exists "Comments visible to authenticated users" on post_comments;
create policy "Comments visible to authenticated users"
  on post_comments for select
  using (auth.uid() is not null);

drop policy if exists "Users can add comments" on post_comments;
create policy "Users can add comments"
  on post_comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own comments" on post_comments;
create policy "Users can delete own comments"
  on post_comments for delete
  using (auth.uid() = user_id);

-- ─── post_tips ───────────────────────────────────────────────────────────────
create table if not exists post_tips (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  fan_id      uuid not null references profiles(id) on delete cascade,
  amount_usd  numeric(10,2) not null check (amount_usd > 0),
  created_at  timestamptz not null default now()
);

create index if not exists post_tips_post_id_idx on post_tips(post_id);

alter table post_tips enable row level security;

drop policy if exists "Tips visible to authenticated users" on post_tips;
create policy "Tips visible to authenticated users"
  on post_tips for select
  using (auth.uid() is not null);

drop policy if exists "Fans can send tips" on post_tips;
create policy "Fans can send tips"
  on post_tips for insert
  with check (auth.uid() = fan_id);
