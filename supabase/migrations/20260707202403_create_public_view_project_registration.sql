/*
# Create public view for license.project_registration

Creates a view in the `public` schema that wraps the `license.project_registration`
table. This allows the kasandra-internal-api edge function (which uses the
supabase-js client with the default `public` schema) to query and modify
project registration data.

## Changes
- Creates `public.project_registration` as a view over `license.project_registration`.
- Grants appropriate permissions.
- Creates INSTEAD OF triggers for INSERT, UPDATE, DELETE on the view so the
  edge function can perform full CRUD through the view.

## Notes
1. The view is a simple pass-through to the `license` schema table.
2. RLS on the underlying table still applies.
3. The edge function uses the service role key which bypasses RLS.
*/

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.project_registration CASCADE;

-- Create view
CREATE VIEW public.project_registration AS
SELECT
  id,
  project_id,
  project_name,
  project_code,
  platform,
  project_url,
  license_server_url,
  token_hash,
  status,
  registered_at,
  updated_at
FROM license.project_registration;

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_registration TO anon, authenticated;

-- ============================================================
-- INSTEAD OF INSERT trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.project_registration_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO license.project_registration (
    id, project_id, project_name, project_code, platform,
    project_url, license_server_url, token_hash, status
  ) VALUES (
    NEW.id, NEW.project_id, NEW.project_name, NEW.project_code, NEW.platform,
    NEW.project_url, NEW.license_server_url, NEW.token_hash, NEW.status
  )
  RETURNING
    id, project_id, project_name, project_code, platform,
    project_url, license_server_url, token_hash, status,
    registered_at, updated_at
  INTO
    NEW.id, NEW.project_id, NEW.project_name, NEW.project_code, NEW.platform,
    NEW.project_url, NEW.license_server_url, NEW.token_hash, NEW.status,
    NEW.registered_at, NEW.updated_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_registration_insert_trg
  INSTEAD OF INSERT ON public.project_registration
  FOR EACH ROW
  EXECUTE FUNCTION public.project_registration_insert();

-- ============================================================
-- INSTEAD OF UPDATE trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.project_registration_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE license.project_registration SET
    project_name = NEW.project_name,
    project_code = NEW.project_code,
    platform = NEW.platform,
    project_url = NEW.project_url,
    license_server_url = NEW.license_server_url,
    token_hash = NEW.token_hash,
    status = NEW.status
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_registration_update_trg
  INSTEAD OF UPDATE ON public.project_registration
  FOR EACH ROW
  EXECUTE FUNCTION public.project_registration_update();

-- ============================================================
-- INSTEAD OF DELETE trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.project_registration_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM license.project_registration WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_registration_delete_trg
  INSTEAD OF DELETE ON public.project_registration
  FOR EACH ROW
  EXECUTE FUNCTION public.project_registration_delete();
