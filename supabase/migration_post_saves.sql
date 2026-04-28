-- ── post_saves (per-user bookmarks) ─────────────────────────────────────────
-- Personal bookmarks: visible only to the owner. Powers the /collections feed.

create table if not exists post_saves (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_saves_user_idx
  on post_saves (user_id, created_at desc);

alter table post_saves enable row level security;

drop policy if exists "Saves visible to owner" on post_saves;
create policy "Saves visible to owner"
  on post_saves for select
  using (auth.uid() = user_id);

drop policy if exists "Users can save posts" on post_saves;
create policy "Users can save posts"
  on post_saves for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can unsave posts" on post_saves;
create policy "Users can unsave posts"
  on post_saves for delete
  using (auth.uid() = user_id);
