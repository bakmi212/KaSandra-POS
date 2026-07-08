/*
# Sprint 2 — Project Connection: Client Application Fields

Extends `license.project_registration` to store information about the
connected Client Application. When a Client calls POST /api/internal/register,
it sends its own application metadata. The License Server stores this to
display on its Project Card ("Connected Client" info).

Also adds a `project_token` column to store the encrypted/hashed token
so the License Server can validate it on /health and /version requests
(which now require Bearer auth).

## Changes to `license.project_registration`
- `connected_app_name`    — Application name reported by the Client
- `connected_app_version` — Application version reported by the Client
- `connected_platform`    — Platform reported by the Client (web/flutter/etc)
- `connected_app_url`     — Application URL reported by the Client
- `connected_at`          — When the Client first connected
- `last_health_check`     — When the Client last called /health successfully

## Notes
1. All new columns are nullable — existing rows are unaffected.
2. The `token_hash` column already exists and is used for token validation.
3. The public view is recreated to expose the new columns.
*/

-- Add connected client columns to license.project_registration
ALTER TABLE license.project_registration
  ADD COLUMN IF NOT EXISTS connected_app_name text,
  ADD COLUMN IF NOT EXISTS connected_app_version text,
  ADD COLUMN IF NOT EXISTS connected_platform text,
  ADD COLUMN IF NOT EXISTS connected_app_url text,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_health_check timestamptz;

-- Recreate the public view to include new columns
DROP VIEW IF EXISTS public.project_registration CASCADE;

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
  updated_at,
  connected_app_name,
  connected_app_version,
  connected_platform,
  connected_app_url,
  connected_at,
  last_health_check
FROM license.project_registration;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_registration TO anon, authenticated;

-- ============================================================
-- INSTEAD OF INSERT trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.project_registration_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO license.project_registration (
    id, project_id, project_name, project_code, platform,
    project_url, license_server_url, token_hash, status,
    connected_app_name, connected_app_version, connected_platform,
    connected_app_url, connected_at, last_health_check
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.project_id, NEW.project_name, NEW.project_code, NEW.platform,
    NEW.project_url, NEW.license_server_url, NEW.token_hash,
    COALESCE(NEW.status, 'registered'),
    NEW.connected_app_name, NEW.connected_app_version, NEW.connected_platform,
    NEW.connected_app_url, NEW.connected_at, NEW.last_health_check
  )
  RETURNING
    id, project_id, project_name, project_code, platform,
    project_url, license_server_url, token_hash, status,
    registered_at, updated_at,
    connected_app_name, connected_app_version, connected_platform,
    connected_app_url, connected_at, last_health_check
  INTO
    NEW.id, NEW.project_id, NEW.project_name, NEW.project_code, NEW.platform,
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

-- ============================================================
-- Client Connection Settings table (Client-side persistence)
-- Stores the Client Application's connection settings to the License Server.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.client_connection_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_server_url text NOT NULL,
  project_token_encrypted text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'connecting', 'connected', 'failed')),
  project_id text,
  project_code text,
  api_version text,
  application_version text,
  last_health_check timestamptz,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_connection_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_client_connection" ON public.client_connection_settings;
CREATE POLICY "select_client_connection" ON public.client_connection_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_client_connection" ON public.client_connection_settings;
CREATE POLICY "insert_client_connection" ON public.client_connection_settings
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_client_connection" ON public.client_connection_settings;
CREATE POLICY "update_client_connection" ON public.client_connection_settings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_client_connection" ON public.client_connection_settings;
CREATE POLICY "delete_client_connection" ON public.client_connection_settings
  FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_client_connection_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_connection_updated_at ON public.client_connection_settings;
CREATE TRIGGER trg_client_connection_updated_at
  BEFORE UPDATE ON public.client_connection_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_client_connection_updated_at();
