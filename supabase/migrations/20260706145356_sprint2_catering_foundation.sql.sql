/*
# Sprint 2 — Catering Management Platform Foundation

Extends KaSandra POS for catering operations.

1. Extended Roles
- super_admin, owner, branch_manager, kitchen_manager, chef, cashier, delivery_staff, customer_service, finance

2. New Tables
- kitchens: multi-kitchen support
- kitchen_staff: staff assignment to kitchens
- kitchen_capacity: production capacity per kitchen
- delivery_staff: delivery driver management
- app_settings: centralized configuration
- notification_templates: notification templates
- notification_queue: pending notifications
*/

-- ============================================================
-- EXTEND PROFILES ROLE CHECK
-- ============================================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role = ANY (ARRAY['super_admin'::text, 'owner'::text, 'branch_manager'::text, 'kitchen_manager'::text, 'chef'::text, 'admin'::text, 'staff'::text, 'kasir'::text, 'cashier'::text, 'delivery_staff'::text, 'customer_service'::text, 'finance'::text]));

-- ============================================================
-- KITCHENS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS kitchens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  type text NOT NULL DEFAULT 'main' CHECK (type IN ('main', 'prep', 'packaging', 'delivery_hub')),
  capacity_per_day int NOT NULL DEFAULT 100,
  current_load int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kitchens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_kitchens" ON kitchens;
CREATE POLICY "select_kitchens" ON kitchens FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_kitchens" ON kitchens;
CREATE POLICY "insert_kitchens" ON kitchens FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_kitchens" ON kitchens;
CREATE POLICY "update_kitchens" ON kitchens FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_kitchens" ON kitchens;
CREATE POLICY "delete_kitchens" ON kitchens FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_kitchens_branch ON kitchens(branch_id);
CREATE INDEX IF NOT EXISTS idx_kitchens_code ON kitchens(code);

-- ============================================================
-- KITCHEN STAFF TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS kitchen_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kitchen_id uuid NOT NULL REFERENCES kitchens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('manager', 'chef', 'prep', 'staff')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(kitchen_id, user_id)
);

ALTER TABLE kitchen_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_kitchen_staff" ON kitchen_staff;
CREATE POLICY "select_kitchen_staff" ON kitchen_staff FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_kitchen_staff" ON kitchen_staff;
CREATE POLICY "insert_kitchen_staff" ON kitchen_staff FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_kitchen_staff" ON kitchen_staff;
CREATE POLICY "update_kitchen_staff" ON kitchen_staff FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_kitchen_staff" ON kitchen_staff;
CREATE POLICY "delete_kitchen_staff" ON kitchen_staff FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_kitchen_staff_kitchen ON kitchen_staff(kitchen_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_staff_user ON kitchen_staff(user_id);

-- ============================================================
-- DELIVERY STAFF TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NOT NULL,
  vehicle_type text CHECK (vehicle_type IN ('motorcycle', 'car', 'van', 'truck')),
  vehicle_plate text,
  is_active boolean NOT NULL DEFAULT true,
  current_location jsonb,
  last_location_update timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delivery_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_delivery_staff" ON delivery_staff;
CREATE POLICY "select_delivery_staff" ON delivery_staff FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_delivery_staff" ON delivery_staff;
CREATE POLICY "insert_delivery_staff" ON delivery_staff FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_delivery_staff" ON delivery_staff;
CREATE POLICY "update_delivery_staff" ON delivery_staff FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_delivery_staff" ON delivery_staff;
CREATE POLICY "delete_delivery_staff" ON delivery_staff FOR DELETE TO authenticated USING (true);

-- ============================================================
-- APP SETTINGS TABLE (Centralized Configuration)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  key text NOT NULL,
  value text,
  value_json jsonb,
  description text,
  is_secret boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id),
  UNIQUE(category, key)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_app_settings" ON app_settings;
CREATE POLICY "select_app_settings" ON app_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_app_settings" ON app_settings;
CREATE POLICY "insert_app_settings" ON app_settings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_app_settings" ON app_settings;
CREATE POLICY "update_app_settings" ON app_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category);

-- Seed default settings
INSERT INTO app_settings (category, key, value, description) VALUES
  ('general', 'business_name', 'KaSandra Catering', 'Business display name'),
  ('general', 'business_tagline', 'Fresh & Delicious Catering', 'Business tagline'),
  ('general', 'currency', 'IDR', 'Default currency'),
  ('general', 'timezone', 'Asia/Jakarta', 'Application timezone'),
  ('general', 'language', 'id', 'Default language code'),
  ('order', 'min_order_amount', '100000', 'Minimum order amount in local currency'),
  ('order', 'order_number_prefix', 'ORD', 'Order number prefix'),
  ('order', 'auto_confirm_order', 'false', 'Auto confirm new orders'),
  ('order', 'lead_time_hours', '24', 'Minimum lead time for orders in hours'),
  ('delivery', 'delivery_fee_base', '15000', 'Base delivery fee'),
  ('delivery', 'delivery_fee_per_km', '5000', 'Delivery fee per km'),
  ('delivery', 'max_delivery_radius_km', '25', 'Maximum delivery radius in km'),
  ('delivery', 'delivery_number_prefix', 'DLV', 'Delivery number prefix'),
  ('production', 'kitchen_prep_buffer_hours', '4', 'Buffer time for kitchen prep'),
  ('production', 'batch_production_enabled', 'true', 'Enable batch production mode'),
  ('notification', 'push_enabled', 'true', 'Push notifications enabled'),
  ('notification', 'email_enabled', 'true', 'Email notifications enabled'),
  ('notification', 'whatsapp_enabled', 'false', 'WhatsApp notifications enabled'),
  ('notification', 'notify_new_order', 'true', 'Notify on new order'),
  ('notification', 'notify_order_confirmed', 'true', 'Notify on order confirmed'),
  ('notification', 'notify_order_ready', 'true', 'Notify on order ready'),
  ('notification', 'notify_delivery_started', 'true', 'Notify on delivery started'),
  ('notification', 'notify_delivery_completed', 'true', 'Notify on delivery completed')
ON CONFLICT (category, key) DO NOTHING;

-- ============================================================
-- NOTIFICATION TEMPLATES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('in_app', 'push', 'email', 'whatsapp', 'sms')),
  subject text,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_notification_templates" ON notification_templates;
CREATE POLICY "select_notification_templates" ON notification_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_notification_templates" ON notification_templates;
CREATE POLICY "insert_notification_templates" ON notification_templates FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_notification_templates" ON notification_templates;
CREATE POLICY "update_notification_templates" ON notification_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Seed notification templates
INSERT INTO notification_templates (code, name, type, subject, body, variables) VALUES
  ('new_order', 'New Order Received', 'in_app', null, 'Pesanan baru #{order_number} dari {customer_name} senilai {total_amount}', '["order_number", "customer_name", "total_amount"]'),
  ('order_confirmed', 'Order Confirmed', 'email', 'Pesanan Anda Dikonfirmasi - {order_number}', 'Yth. {customer_name}, pesanan Anda #{order_number} telah dikonfirmasi. Estimasi pengiriman: {delivery_date}.', '["customer_name", "order_number", "delivery_date"]'),
  ('order_ready', 'Order Ready', 'push', null, 'Pesanan #{order_number} sudah siap!', '["order_number"]'),
  ('delivery_started', 'Delivery Started', 'push', null, '{driver_name} sedang dalam perjalanan mengantar pesanan #{order_number}', '["driver_name", "order_number"]'),
  ('delivery_completed', 'Delivery Completed', 'email', 'Pesanan Selesai - {order_number}', 'Terima kasih! Pesanan #{order_number} telah selesai. Kami berharap Anda puas dengan layanan kami.', '["order_number"]')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- NOTIFICATION QUEUE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code text NOT NULL REFERENCES notification_templates(code) ON DELETE CASCADE,
  recipient_type text NOT NULL CHECK (recipient_type IN ('user', 'customer', 'email', 'phone')),
  recipient_id uuid,
  recipient_email text,
  recipient_phone text,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  error_message text,
  retry_count int NOT NULL DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_notification_queue" ON notification_queue;
CREATE POLICY "select_notification_queue" ON notification_queue FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_notification_queue" ON notification_queue;
CREATE POLICY "insert_notification_queue" ON notification_queue FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_notification_queue" ON notification_queue;
CREATE POLICY "update_notification_queue" ON notification_queue FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled ON notification_queue(scheduled_at);

-- ============================================================
-- IN-APP NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  data jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON in_app_notifications;
CREATE POLICY "select_own_notifications" ON in_app_notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_notifications" ON in_app_notifications;
CREATE POLICY "insert_notifications" ON in_app_notifications FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_own_notifications" ON in_app_notifications;
CREATE POLICY "update_own_notifications" ON in_app_notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_read ON in_app_notifications(read_at);

-- ============================================================
-- ROLE PERMISSIONS EXTENSION
-- Add catering-specific permissions
-- ============================================================
INSERT INTO role_permissions (role, page_key, allowed)
SELECT 'kitchen_manager', key, true
FROM unnest(array['dashboard', 'pos', 'products', 'categories', 'stock', 'purchases', 'goods-receipt', 'reports', 'settings']) AS key
ON CONFLICT (role, page_key) DO NOTHING;

INSERT INTO role_permissions (role, page_key, allowed)
SELECT 'chef', key, true
FROM unnest(array['dashboard', 'products', 'categories', 'stock']) AS key
ON CONFLICT (role, page_key) DO NOTHING;

INSERT INTO role_permissions (role, page_key, allowed)
SELECT 'delivery_staff', key, true
FROM unnest(array['dashboard']) AS key
ON CONFLICT (role, page_key) DO NOTHING;

INSERT INTO role_permissions (role, page_key, allowed)
SELECT 'customer_service', key, true
FROM unnest(array['dashboard', 'customers', 'reports']) AS key
ON CONFLICT (role, page_key) DO NOTHING;

INSERT INTO role_permissions (role, page_key, allowed)
SELECT 'finance', key, true
FROM unnest(array['dashboard', 'finance', 'reports']) AS key
ON CONFLICT (role, page_key) DO NOTHING;
