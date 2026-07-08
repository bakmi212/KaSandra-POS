/*
# Sprint 10 — Webhooks & External Integrations Schema

1. New Tables
- `webhooks` — registered webhook endpoints (URL, events, secret, active flag)
- `webhook_deliveries` — delivery attempts log (status, response, retries)
- `api_tokens` — JWT-based API tokens for REST API access (issued to external integrations)
- `integration_settings` — single-row table storing config for WhatsApp, Email, Google Drive, Google Sheets

2. Columns
- webhooks: id, name, url, events (text[]), secret, is_active, created_at
- webhook_deliveries: id, webhook_id, event, payload (jsonb), status, response_code, attempts, delivered_at, created_at
- api_tokens: id, name, token_hash, is_active, expires_at, created_at
- integration_settings: id (fixed), whatsapp_api_key, whatsapp_phone_id, email_from, google_drive_folder_id, google_sheets_id, updated_at

3. Security
- RLS enabled on all tables, scoped to authenticated users (admin-only in app logic)
- webhook_deliveries is read-only from app (insert/update done via service role in edge functions)
*/

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  secret text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_webhooks" ON webhooks;
CREATE POLICY "select_webhooks" ON webhooks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_webhooks" ON webhooks;
CREATE POLICY "insert_webhooks" ON webhooks FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_webhooks" ON webhooks;
CREATE POLICY "update_webhooks" ON webhooks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_webhooks" ON webhooks;
CREATE POLICY "delete_webhooks" ON webhooks FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid REFERENCES webhooks(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  response_code int,
  attempts int NOT NULL DEFAULT 0,
  error text,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_webhook_deliveries" ON webhook_deliveries;
CREATE POLICY "select_webhook_deliveries" ON webhook_deliveries FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_api_tokens" ON api_tokens;
CREATE POLICY "select_api_tokens" ON api_tokens FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_api_tokens" ON api_tokens;
CREATE POLICY "insert_api_tokens" ON api_tokens FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_api_tokens" ON api_tokens;
CREATE POLICY "update_api_tokens" ON api_tokens FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_api_tokens" ON api_tokens;
CREATE POLICY "delete_api_tokens" ON api_tokens FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS integration_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_api_key text,
  whatsapp_phone_id text,
  whatsapp_business_id text,
  email_smtp_host text,
  email_smtp_port int DEFAULT 587,
  email_smtp_user text,
  email_smtp_pass text,
  email_from text,
  google_drive_folder_id text,
  google_drive_token text,
  google_sheets_id text,
  google_sheets_token text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_integration_settings" ON integration_settings;
CREATE POLICY "select_integration_settings" ON integration_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "update_integration_settings" ON integration_settings;
CREATE POLICY "update_integration_settings" ON integration_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "insert_integration_settings" ON integration_settings;
CREATE POLICY "insert_integration_settings" ON integration_settings FOR INSERT TO authenticated WITH CHECK (true);

-- Seed a default row if none exists
INSERT INTO integration_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM integration_settings);
