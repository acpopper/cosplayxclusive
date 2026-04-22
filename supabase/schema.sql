-- CosplayXclusive DB Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles (extends auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  creator_status text check (creator_status in ('pending', 'approved', 'rejected')),
  subscription_price_usd numeric(10,2),
  fandom_tags text[] default '{}',
  stripe_customer_id text,
  stripe_account_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Posts
create table posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id) on delete cascade,
  caption text,
  access_type text not null default 'free' check (access_type in ('free', 'subscriber_only', 'ppv')),
  price_usd numeric(10,2),
  -- media_paths: private storage paths for originals
  -- preview_paths: public storage paths for low-res previews (blurred in UI)
  -- media_types: 'image' or 'video' per index, parallel to media_paths
  media_paths text[] default '{}',
  preview_paths text[] default '{}',
  media_types text[] default '{}',
  published_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Subscriptions
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid not null references profiles(id) on delete cascade,
  creator_id uuid not null references profiles(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  status text not null check (status in ('active', 'canceled', 'past_due', 'incomplete', 'trialing')),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (fan_id, creator_id)
);

-- PPV Post Purchases
create table post_purchases (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid not null references profiles(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  stripe_payment_intent_id text,
  amount_usd numeric(10,2),
  created_at timestamptz default now(),
  unique (fan_id, post_id)
);

-- Transactions (for earnings summary)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references profiles(id),
  fan_id uuid references profiles(id),
  type text not null check (type in ('subscription', 'ppv')),
  amount_usd numeric(10,2) not null,
  stripe_event_id text unique,
  created_at timestamptz default now()
);

-- =====================
-- Row Level Security
-- =====================

alter table profiles enable row level security;
alter table posts enable row level security;
alter table subscriptions enable row level security;
alter table post_purchases enable row level security;
alter table transactions enable row level security;

-- Profiles: anyone can read public profile data
create policy "profiles_public_read" on profiles
  for select using (true);

-- Profiles: users can update their own profile
create policy "profiles_own_update" on profiles
  for update using (auth.uid() = id);

-- Profiles: insert on signup (via trigger)
create policy "profiles_own_insert" on profiles
  for insert with check (auth.uid() = id);

-- Posts: free posts are public, others require access check via functions
create policy "posts_public_read" on posts
  for select using (true); -- access enforcement is in application layer

-- Posts: creators can manage their own posts
create policy "posts_creator_insert" on posts
  for insert with check (auth.uid() = creator_id);

create policy "posts_creator_update" on posts
  for update using (auth.uid() = creator_id);

create policy "posts_creator_delete" on posts
  for delete using (auth.uid() = creator_id);

-- Subscriptions: users can read their own
create policy "subscriptions_own_read" on subscriptions
  for select using (auth.uid() = fan_id or auth.uid() = creator_id);

create policy "subscriptions_service_all" on subscriptions
  for all using (true); -- service role handles writes

-- Post purchases: users can read their own
create policy "purchases_own_read" on post_purchases
  for select using (auth.uid() = fan_id);

create policy "purchases_service_all" on post_purchases
  for all using (true);

-- Transactions: creators see their own
create policy "transactions_creator_read" on transactions
  for select using (auth.uid() = creator_id);

create policy "transactions_service_all" on transactions
  for all using (true);

-- =====================
-- Trigger: auto-create profile on signup
-- =====================
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    'user'
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- =====================
-- Storage buckets
-- =====================
-- Run these or create via Supabase dashboard:
-- insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
-- insert into storage.buckets (id, name, public) values ('banners', 'banners', true);
-- insert into storage.buckets (id, name, public) values ('previews', 'previews', true);
-- insert into storage.buckets (id, name, public) values ('originals', 'originals', false);

-- Storage policies for avatars (public bucket)
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_auth_upload" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

create policy "avatars_own_update" on storage.objects
  for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for banners (public)
create policy "banners_public_read" on storage.objects
  for select using (bucket_id = 'banners');

create policy "banners_auth_upload" on storage.objects
  for insert with check (bucket_id = 'banners' and auth.role() = 'authenticated');

-- Storage policies for previews (public - low-res blurred)
create policy "previews_public_read" on storage.objects
  for select using (bucket_id = 'previews');

create policy "previews_auth_upload" on storage.objects
  for insert with check (bucket_id = 'previews' and auth.role() = 'authenticated');

-- Storage policies for originals (private - no public read)
create policy "originals_no_public" on storage.objects
  for select using (bucket_id = 'originals' and auth.role() = 'authenticated');
-- Note: actual signed URL generation is done server-side after access check

-- =====================
-- Migrations (run after initial setup)
-- =====================
-- alter table posts add column if not exists media_types text[] default '{}';
