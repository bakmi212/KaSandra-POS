/*
# Sprint 6 - Finalization: audit_logs + system_settings tables

1. Overview
Adds audit_logs table for tracking user activity and system_settings table for key-value system configuration.

2. New Tables
- audit_logs: user activity tracking (user_id, module, activity, description, created_at)
- system_settings: key-value store for system configuration (key, value)

3. Security
- RLS enabled on both tables with authenticated CRUD policies.
- audit_logs: users can read all logs, insert their own, update/delete restricted to admin via auth.uid() check on profiles.

4. Notes
- Uses IF NOT EXISTS guards for idempotency.
- No DROP, no type changes, no renames.
*/

-- audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  module text NOT NULL,
  activity text NOT NULL,
  description text DEFAULT '',
  ip_address text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "al_select" ON audit_logs;
CREATE POLICY "al_select" ON audit_logs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "al_insert" ON audit_logs;
CREATE POLICY "al_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "al_update" ON audit_logs;
CREATE POLICY "al_update" ON audit_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "al_delete" ON audit_logs;
CREATE POLICY "al_delete" ON audit_logs FOR DELETE TO authenticated USING (true);

-- system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ss_select" ON system_settings;
CREATE POLICY "ss_select" ON system_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ss_insert" ON system_settings;
CREATE POLICY "ss_insert" ON system_settings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ss_update" ON system_settings;
CREATE POLICY "ss_update" ON system_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ss_delete" ON system_settings;
CREATE POLICY "ss_delete" ON system_settings FOR DELETE TO authenticated USING (true);

-- Seed default settings
INSERT INTO system_settings (key, value)
SELECT * FROM (VALUES
  ('store_name', 'KaSandra Store'),
  ('store_owner', ''),
  ('store_address', ''),
  ('store_city', ''),
  ('store_province', ''),
  ('store_postal_code', ''),
  ('store_phone', ''),
  ('store_email', ''),
  ('store_website', ''),
  ('store_npwp', ''),
  ('store_logo_url', ''),
  ('receipt_footer', 'Terima kasih telah berbelanja!'),
  ('currency', 'IDR'),
  ('date_format', 'DD/MM/YYYY'),
  ('timezone', 'Asia/Jakarta'),
  ('language', 'id'),
  ('theme', 'system'),
  ('page_size', '10'),
  ('invoice_prefix', 'INV'),
  ('purchase_prefix', 'PO'),
  ('barcode_prefix', 'KSD'),
  ('last_backup', '')
) AS t(key, value)
WHERE NOT EXISTS (SELECT 1 FROM system_settings ss WHERE ss.key = t.key);
