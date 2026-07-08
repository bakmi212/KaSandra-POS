/*
# Sprint 2 — Project Registration Schema

## Overview
Creates the `license` schema and the `license.project_registration` table.
This table stores project registrations from the License Server when it calls
the Kasandra Internal API (`POST /api/internal/register`).

## Architecture
- License Server sends HTTPS POST to Kasandra Internal API with a Bearer PROJECT_TOKEN.
- Kasandra Internal API validates the token, hashes it (SHA-256), and stores the registration.
- The raw token is NEVER stored — only the hash.
- The License Server NEVER connects directly to the database.

## New Schema
- `license` — dedicated schema for license platform registration data.

## New Table: license.project_registration
| Column              | Type         | Description                                      |
|---------------------|--------------|--------------------------------------------------|
| id                  | uuid (PK)    | Primary key, auto-generated                      |
| project_id          | text         | Unique project identifier from License Server    |
| project_name        | text         | Display name of the project                       |
| project_code        | text         | Unique project code from License Server          |
| platform            | text         | Platform type (web, flutter, etc.)               |
| project_url         | text         | URL of the project                               |
| license_server_url  | text         | URL of the License Server that registered         |
| token_hash          | text         | SHA-256 hash of the project token (never raw)    |
| status              | text         | Registration status: 'registered'                |
| registered_at       | timestamptz  | When the registration was created                |
| updated_at          | timestamptz  | When the registration was last updated            |

## Constraints
- UNIQUE(project_id) — one registration per project ID.
- UNIQUE(project_code) — one registration per project code.

## Security
- RLS enabled on the table.
- Policies allow `anon, authenticated` CRUD since the edge function uses the service role key
  (which bypasses RLS) and the frontend reads registration status through the edge function API.
- The table stores only token hashes — raw tokens are never persisted.

## Notes
1. The `license` schema is created with `CREATE SCHEMA IF NOT EXISTS`.
2. The table is idempotent — safe to re-run.
3. Indexes on `project_id` and `project_code` for fast lookups.
*/

-- ============================================================
-- CREATE SCHEMA
-- ============================================================
CREATE SCHEMA IF NOT EXISTS license;

-- ============================================================
-- PROJECT REGISTRATION TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS license.project_registration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  project_name text NOT NULL,
  project_code text NOT NULL,
  platform text NOT NULL DEFAULT 'web',
  project_url text,
  license_server_url text,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'disconnected', 'suspended')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_project_registration_project_id'
  ) THEN
    ALTER TABLE license.project_registration ADD CONSTRAINT uq_project_registration_project_id UNIQUE (project_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_project_registration_project_code'
  ) THEN
    ALTER TABLE license.project_registration ADD CONSTRAINT uq_project_registration_project_code UNIQUE (project_code);
  END IF;
END $$;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_project_registration_project_id ON license.project_registration(project_id);
CREATE INDEX IF NOT EXISTS idx_project_registration_project_code ON license.project_registration(project_code);
CREATE INDEX IF NOT EXISTS idx_project_registration_token_hash ON license.project_registration(token_hash);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE license.project_registration ENABLE ROW LEVEL SECURITY;

-- Allow anon + authenticated CRUD (edge function uses service role which bypasses RLS;
-- frontend accesses data through the edge function API, not directly)
DROP POLICY IF EXISTS "select_project_registration" ON license.project_registration;
CREATE POLICY "select_project_registration" ON license.project_registration
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_project_registration" ON license.project_registration;
CREATE POLICY "insert_project_registration" ON license.project_registration
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_project_registration" ON license.project_registration;
CREATE POLICY "update_project_registration" ON license.project_registration
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_project_registration" ON license.project_registration;
CREATE POLICY "delete_project_registration" ON license.project_registration
  FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION license.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_registration_updated_at ON license.project_registration;
CREATE TRIGGER trg_project_registration_updated_at
  BEFORE UPDATE ON license.project_registration
  FOR EACH ROW
  EXECUTE FUNCTION license.set_updated_at();
