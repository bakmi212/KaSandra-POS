/*
# License Subscriptions Table

Stores subscription orders before they become licenses.
Tracks payment status and connects packages to device activation.
*/

CREATE TABLE IF NOT EXISTS license_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES license_projects(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES license_plans(id) ON DELETE CASCADE,
  order_number text NOT NULL UNIQUE,
  device_id text NOT NULL,
  customer_name text,
  customer_email text,
  
  -- Payment info
  payment_method text,
  amount numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'IDR',
  
  -- Payment proof
  payment_proof_url text,
  payment_confirmed_at timestamptz,
  paid_at timestamptz,
  verified_at timestamptz,
  
  -- Auto-generated license after payment
  license_key text,
  license_id uuid REFERENCES licenses(id) ON DELETE SET NULL,
  
  -- Status: waiting_payment, waiting_verification, paid, verified, failed, expired, cancelled
  status text NOT NULL DEFAULT 'waiting_payment',
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE license_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_subscriptions_project" ON license_subscriptions FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_subscriptions" ON license_subscriptions FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_subscriptions" ON license_subscriptions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_license_subscriptions_order ON license_subscriptions(order_number);
CREATE INDEX idx_license_subscriptions_device ON license_subscriptions(device_id);
CREATE INDEX idx_license_subscriptions_status ON license_subscriptions(status);

-- Update license_plans to add label and description columns
ALTER TABLE license_plans ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE license_plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE license_plans ADD COLUMN IF NOT EXISTS sort_order int NOT NULL DEFAULT 0;

-- Update license_features to mark menu items
ALTER TABLE license_features ADD COLUMN IF NOT EXISTS is_menu boolean NOT NULL DEFAULT false;

-- Seed some example packages for the demo project
UPDATE license_plans SET 
  label = 'best_seller',
  description = 'Paket ideal untuk usaha menengah',
  sort_order = 2
WHERE code = 'business';

UPDATE license_plans SET 
  label = 'popular',
  description = 'Paket hemat cocok untuk usaha kecil',
  sort_order = 1
WHERE code = 'starter';

UPDATE license_plans SET 
  label = 'enterprise',
  description = 'Fitur lengkap untuk usaha besar',
  sort_order = 3
WHERE code = 'enterprise';
