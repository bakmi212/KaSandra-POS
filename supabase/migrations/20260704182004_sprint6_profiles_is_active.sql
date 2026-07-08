/*
# Sprint 6 - Add is_active column to profiles
Allows admin to activate/deactivate users without deleting them.
*/
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_active') THEN
    ALTER TABLE profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- Set existing profiles to active
UPDATE profiles SET is_active = true WHERE is_active IS NULL;
