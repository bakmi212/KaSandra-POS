/*
# Sprint 16 — Universal License Platform Schema

1. New Tables
- `license_projects` — registered projects/apps (name, api_key_hash, secret_hash, settings)
- `license_plans` — subscription plans per project (name, price, duration, max_devices, trial_days)
- `license_features` — feature definitions per plan (key, type, value)
- `licenses` — issued license keys (key, project, plan, status, expires_at)
- `license_devices` — device bindings per license (device_id, name, platform, app_version)

2. Security
- RLS enabled on all tables. Service-role only access (edge functions use service role key).
- No direct client access — all operations go through the license API edge function.
*/

-- ============================================================
-- LICENSE PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS license_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  api_key_hash text NOT NULL UNIQUE,
  secret_hash text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE license_projects ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- LICENSE PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS license_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES license_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  price numeric(14,2) NOT NULL DEFAULT 0,
  duration_days int NOT NULL DEFAULT 30,
  max_devices int NOT NULL DEFAULT 1,
  trial_days int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE license_plans ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_license_plans_project ON license_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_license_plans_code ON license_plans(code);

-- ============================================================
-- LICENSE FEATURES
-- ============================================================
CREATE TABLE IF NOT EXISTS license_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES license_plans(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  feature_type text NOT NULL CHECK (feature_type IN ('boolean', 'number', 'string', 'json')),
  feature_value text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE license_features ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_license_features_plan ON license_features(plan_id);

-- ============================================================
-- LICENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES license_projects(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES license_plans(id) ON DELETE CASCADE,
  license_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'expired', 'suspended', 'revoked')),
  customer_name text,
  customer_email text,
  max_devices int NOT NULL DEFAULT 1,
  activated_devices int NOT NULL DEFAULT 0,
  activated_at timestamptz,
  expires_at timestamptz,
  last_check_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_licenses_project ON licenses(project_id);
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);

-- ============================================================
-- LICENSE DEVICES
-- ============================================================
CREATE TABLE IF NOT EXISTS license_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text,
  platform text,
  app_version text,
  package_name text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  registered_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE license_devices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_license_devices_license ON license_devices(license_id);
CREATE INDEX IF NOT EXISTS idx_license_devices_device ON license_devices(device_id);

-- ============================================================
-- SEED: Default project for KaSandra POS
-- ============================================================
INSERT INTO license_projects (name, api_key_hash, secret_hash, settings)
SELECT 'KaSandra POS', 'ksandra_prod_2026', 'ksandra_secret_2026', '{"app_name": "KaSandra POS", "version": "1.0.0"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM license_projects WHERE name = 'KaSandra POS');

-- Seed default plans
INSERT INTO license_plans (project_id, name, code, price, duration_days, max_devices, trial_days)
SELECT p.id, 'Starter', 'starter', 0, 36500, 1, 30
FROM license_projects p WHERE p.name = 'KaSandra POS'
AND NOT EXISTS (SELECT 1 FROM license_plans WHERE code = 'starter');

INSERT INTO license_plans (project_id, name, code, price, duration_days, max_devices, trial_days)
SELECT p.id, 'Pro', 'pro', 199000, 30, 3, 0
FROM license_projects p WHERE p.name = 'KaSandra POS'
AND NOT EXISTS (SELECT 1 FROM license_plans WHERE code = 'pro');

INSERT INTO license_plans (project_id, name, code, price, duration_days, max_devices, trial_days)
SELECT p.id, 'Business', 'business', 499000, 30, 999, 0
FROM license_projects p WHERE p.name = 'KaSandra POS'
AND NOT EXISTS (SELECT 1 FROM license_plans WHERE code = 'business');

-- Seed features for Starter plan
INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'max_outlets', 'number', '1'
FROM license_plans pl WHERE pl.code = 'starter'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'max_outlets');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'max_cashiers', 'number', '1'
FROM license_plans pl WHERE pl.code = 'starter'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'max_cashiers');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'max_products', 'number', '100'
FROM license_plans pl WHERE pl.code = 'starter'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'max_products');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'reports', 'boolean', 'basic'
FROM license_plans pl WHERE pl.code = 'starter'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'reports');

-- Seed features for Pro plan
INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'max_outlets', 'number', '3'
FROM license_plans pl WHERE pl.code = 'pro'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'max_outlets');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'max_cashiers', 'number', '5'
FROM license_plans pl WHERE pl.code = 'pro'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'max_cashiers');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'reports', 'boolean', 'full'
FROM license_plans pl WHERE pl.code = 'pro'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'reports');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'multi_payment', 'boolean', 'true'
FROM license_plans pl WHERE pl.code = 'pro'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'multi_payment');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'stock_management', 'boolean', 'true'
FROM license_plans pl WHERE pl.code = 'pro'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'stock_management');

-- Seed features for Business plan
INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'max_outlets', 'number', '999'
FROM license_plans pl WHERE pl.code = 'business'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'max_outlets');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'max_cashiers', 'number', '999'
FROM license_plans pl WHERE pl.code = 'business'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'max_cashiers');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'ai_assistant', 'boolean', 'true'
FROM license_plans pl WHERE pl.code = 'business'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'ai_assistant');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'api_integration', 'boolean', 'true'
FROM license_plans pl WHERE pl.code = 'business'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'api_integration');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'priority_support', 'boolean', 'true'
FROM license_plans pl WHERE pl.code = 'business'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'priority_support');

INSERT INTO license_features (plan_id, feature_key, feature_type, feature_value)
SELECT pl.id, 'custom_branding', 'boolean', 'true'
FROM license_plans pl WHERE pl.code = 'business'
AND NOT EXISTS (SELECT 1 FROM license_features WHERE plan_id = pl.id AND feature_key = 'custom_branding');
