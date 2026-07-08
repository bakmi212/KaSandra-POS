/*
# Sprint 2.1 — Project Registration: Add project_slug

Adds a `project_slug` column to `license.project_registration` to support
the Client Application registration flow where the client sends
project_name + project_slug + platform + application_version.

Also adds `registered_at` as a proper column (was already present but
kept for clarity) and ensures the public view exposes project_slug.

## Changes
- New column: `license.project_registration.project_slug` (text, nullable)
- Recreated public view to include project_slug
- Updated INSTEAD OF INSERT/UPDATE triggers to handle project_slug
*/

ALTER TABLE license.project_registration
  ADD COLUMN IF NOT EXISTS project_slug text;

DROP VIEW IF EXISTS public.project_registration CASCADE;

CREATE VIEW public.project_registration AS
SELECT
  id, project_id, project_name, project_code, project_slug, platform,
  project_url, license_server_url, token_hash, status,
  registered_at, updated_at,
  connected_app_name, connected_app_version, connected_platform,
  connected_app_url, connected_at, last_health_check
FROM license.project_registration;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_registration TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.project_registration_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO license.project_registration (
    id, project_id, project_name, project_code, project_slug, platform,
    project_url, license_server_url, token_hash, status,
    connected_app_name, connected_app_version, connected_platform,
    connected_app_url, connected_at, last_health_check
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.project_id, NEW.project_name, NEW.project_code, NEW.project_slug, NEW.platform,
    NEW.project_url, NEW.license_server_url, NEW.token_hash,
    COALESCE(NEW.status, 'registered'),
    NEW.connected_app_name, NEW.connected_app_version, NEW.connected_platform,
    NEW.connected_app_url, NEW.connected_at, NEW.last_health_check
  )
  RETURNING
    id, project_id, project_name, project_code, project_slug, platform,
    project_url, license_server_url, token_hash, status,
    registered_at, updated_at,
    connected_app_name, connected_app_version, connected_platform,
    connected_app_url, connected_at, last_health_check
  INTO
    NEW.id, NEW.project_id, NEW.project_name, NEW.project_code, NEW.project_slug, NEW.platform,
    NEW.project_url, NEW.license_server_url, NEW.token_hash, NEW.status,
    NEW.registered_at, NEW.updated_at,
    NEW.connected_app_name, NEW.connected_app_version, NEW.connected_platform,
    NEW.connected_app_url, NEW.connected_at, NEW.last_health_check;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_registration_insert_trg
  INSTEAD OF INSERT ON public.project_registration
  FOR EACH ROW
  EXECUTE FUNCTION public.project_registration_insert();

CREATE OR REPLACE FUNCTION public.project_registration_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE license.project_registration SET
    project_name = NEW.project_name,
    project_code = NEW.project_code,
    project_slug = NEW.project_slug,
    platform = NEW.platform,
    project_url = NEW.project_url,
    license_server_url = NEW.license_server_url,
    token_hash = NEW.token_hash,
    status = NEW.status,
    connected_app_name = NEW.connected_app_name,
    connected_app_version = NEW.connected_app_version,
    connected_platform = NEW.connected_platform,
    connected_app_url = NEW.connected_app_url,
    connected_at = NEW.connected_at,
    last_health_check = NEW.last_health_check
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER project_registration_update_trg
  INSTEAD OF UPDATE ON public.project_registration
  FOR EACH ROW
  EXECUTE FUNCTION public.project_registration_update();

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
