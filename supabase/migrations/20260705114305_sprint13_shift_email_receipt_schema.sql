/*
# Sprint 13 — Shift Kasir, Receipt Settings, Email Notifications

1. New Tables
- `shifts` — cashier shift tracking (open/close, modal awal, sales totals, selisih)
- `email_recipients` — multi-email recipients for scheduled reports

2. Modified Tables
- `system_settings` — no schema change (already a flat key-value store); new keys added via DML:
  receipt_print_logo, receipt_print_store_name, receipt_print_address, receipt_print_phone,
  receipt_print_cashier, receipt_print_customer, receipt_print_table, receipt_print_note,
  receipt_print_payment_method, receipt_print_invoice_no, receipt_print_datetime,
  store_instagram, store_facebook, store_tiktok,
  email_report_enabled, email_report_schedule, email_report_send_time

3. Security
- RLS enabled on new tables, scoped to authenticated users
*/

-- ============================================================
-- SHIFTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cashier_name text,
  branch_id uuid,
  opening_balance numeric NOT NULL DEFAULT 0,
  closing_balance numeric,
  total_sales numeric NOT NULL DEFAULT 0,
  total_cash numeric NOT NULL DEFAULT 0,
  total_qris numeric NOT NULL DEFAULT 0,
  total_ewallet numeric NOT NULL DEFAULT 0,
  total_transfer numeric NOT NULL DEFAULT 0,
  physical_cash numeric,
  difference numeric,
  opening_note text,
  closing_note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_shifts" ON shifts;
CREATE POLICY "select_shifts" ON shifts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_shifts" ON shifts;
CREATE POLICY "insert_shifts" ON shifts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_shifts" ON shifts;
CREATE POLICY "update_shifts" ON shifts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_shifts_cashier ON shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON shifts(opened_at DESC);

-- ============================================================
-- EMAIL RECIPIENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS email_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE email_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "select_email_recipients" ON email_recipients;
CREATE POLICY "select_email_recipients" ON email_recipients FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_email_recipients" ON email_recipients;
CREATE POLICY "insert_email_recipients" ON email_recipients FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "update_email_recipients" ON email_recipients;
CREATE POLICY "update_email_recipients" ON email_recipients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "delete_email_recipients" ON email_recipients;
CREATE POLICY "delete_email_recipients" ON email_recipients FOR DELETE TO authenticated USING (true);

-- ============================================================
-- SEED DEFAULT RECEIPT SETTINGS
-- ============================================================
INSERT INTO system_settings (key, value) VALUES
  ('receipt_print_logo', 'true'),
  ('receipt_print_store_name', 'true'),
  ('receipt_print_address', 'true'),
  ('receipt_print_phone', 'true'),
  ('receipt_print_cashier', 'true'),
  ('receipt_print_customer', 'true'),
  ('receipt_print_table', 'true'),
  ('receipt_print_note', 'true'),
  ('receipt_print_payment_method', 'true'),
  ('receipt_print_invoice_no', 'true'),
  ('receipt_print_datetime', 'true'),
  ('email_report_enabled', 'false'),
  ('email_report_schedule', 'daily'),
  ('email_report_send_time', '20:00')
ON CONFLICT (key) DO NOTHING;
