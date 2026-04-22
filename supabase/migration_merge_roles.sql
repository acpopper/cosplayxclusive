-- ── Merge fan/creator roles into a single 'user' role ────────────────────────
-- creator_status drives all creator-specific features from here on.

-- 1. Drop the old role CHECK constraint FIRST so 'user' is an allowed value
--    before we try to update existing rows.
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Migrate existing roles: both 'fan' and 'creator' become 'user'
UPDATE profiles
SET role = 'user'
WHERE role IN ('fan', 'creator');

-- 3. Re-add the CHECK constraint with the new allowed values
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('user', 'admin'));

-- 4. Add creator application fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS creator_application text,
  ADD COLUMN IF NOT EXISTS creator_applied_at timestamptz;

-- 5. Index for admin queries on creator applications
CREATE INDEX IF NOT EXISTS profiles_creator_status_idx
  ON profiles (creator_status)
  WHERE creator_status IS NOT NULL;

-- Note on RLS policies that referenced role = 'creator' or role = 'fan':
-- Subscriptions: allow any user to subscribe (not just fans).
-- Posts: creation already gated by creator_status = 'approved' in app layer.

-- 5. Update the auth trigger so new signups get role='user' by default
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    'user'   -- everyone is a user; creator status is applied for separately
  );
  RETURN NEW;
END;
$$;
