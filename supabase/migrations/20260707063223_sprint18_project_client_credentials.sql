/*
# Sprint 18 — Project Client Integration

Add client credentials table for secure Project ↔ Client communication.

Each project can have one set of client credentials that external
applications use to connect and download configuration.
*/

-- ============================================================
-- PROJECT CLIENT CREDENTIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS project_client_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES license_projects(id) ON DELETE CASCADE,
  client_id text NOT NULL UNIQUE,
  client_secret_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_connected_at timestamptz,
  connected_device_id text,
  connected_device_name text,
  connected_platform text,
  connected_app_version text,
  connection_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT one_credential_per_project UNIQUE (project_id)
);

ALTER TABLE project_client_credentials ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_client_credentials_project ON project_client_credentials(project_id);
CREATE INDEX IF NOT EXISTS idx_client_credentials_client_id ON project_client_credentials(client_id);

-- ============================================================
-- PROJECT CLIENT SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS project_client_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL REFERENCES project_client_credentials(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  device_id text NOT NULL,
  device_name text,
  platform text,
  app_version text,
  ip_address text,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_client_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_client_sessions_credential ON project_client_sessions(credential_id);
CREATE INDEX IF NOT EXISTS idx_client_sessions_token ON project_client_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_client_sessions_device ON project_client_sessions(device_id);

-- ============================================================
-- SEED: Create credentials for KaSandra POS
-- ============================================================
INSERT INTO project_client_credentials (project_id, client_id, client_secret_hash)
SELECT 
  p.id, 
  'cli_' || encode(gen_random_bytes(24), 'hex'),
  'sec_' || encode(gen_random_bytes(32), 'hex')
FROM license_projects p 
WHERE p.name = 'KaSandra POS'
AND NOT EXISTS (SELECT 1 FROM project_client_credentials WHERE project_id = p.id);