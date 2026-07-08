/*
# Fix project_registration insert trigger

The INSTEAD OF INSERT trigger on the public.project_registration view
needs to handle the case where `id` is not provided by the client
(PostgREST inserts through views don't use column defaults from the
underlying table). This fix generates a UUID when id is null.

## Changes
- Updates the insert trigger function to use gen_random_uuid() when id is null.
*/

CREATE OR REPLACE FUNCTION public.project_registration_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO license.project_registration (
    id, project_id, project_name, project_code, platform,
    project_url, license_server_url, token_hash, status
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.project_id, NEW.project_name, NEW.project_code, NEW.platform,
    NEW.project_url, NEW.license_server_url, NEW.token_hash, COALESCE(NEW.status, 'registered')
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
