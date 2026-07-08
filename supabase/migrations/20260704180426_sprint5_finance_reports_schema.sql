/*
# Sprint 5 - Finance & Reports module schema

1. Overview
Adds cash_accounts, finance_categories, cash_transfers tables. Expands cash_transactions with account_id, category_id, transaction_type, reference_number, attachment columns. Seeds default cash account and finance categories.

2. New Tables
- cash_accounts: cash registers (name, opening_balance, current_balance, is_active)
- finance_categories: income/expense categories (name, type: 'pendapatan'|'pengeluaran')
- cash_transfers: transfers between cash accounts (from_account, to_account, amount, notes)

3. Modified Tables
- cash_transactions: add account_id, category_id, transaction_type ('masuk'|'keluar'|'transfer'), reference_number, attachment. Existing type column kept; transaction_type is the new spec column.

4. Security
- RLS enabled on all new tables with authenticated CRUD policies.
- No changes to existing policies.

5. Notes
- All additions use DO $$ ... IF NOT EXISTS ... END $$ guards for idempotency.
- No DROP, no type changes, no renames — existing data preserved.
- Default cash account "Kas Utama" and default finance categories seeded if not present.
*/

-- cash_accounts table
CREATE TABLE IF NOT EXISTS cash_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ca_select" ON cash_accounts;
CREATE POLICY "ca_select" ON cash_accounts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ca_insert" ON cash_accounts;
CREATE POLICY "ca_insert" ON cash_accounts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ca_update" ON cash_accounts;
CREATE POLICY "ca_update" ON cash_accounts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ca_delete" ON cash_accounts;
CREATE POLICY "ca_delete" ON cash_accounts FOR DELETE TO authenticated USING (true);

-- finance_categories table
CREATE TABLE IF NOT EXISTS finance_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('pendapatan', 'pengeluaran')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fc_select" ON finance_categories;
CREATE POLICY "fc_select" ON finance_categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "fc_insert" ON finance_categories;
CREATE POLICY "fc_insert" ON finance_categories FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "fc_update" ON finance_categories;
CREATE POLICY "fc_update" ON finance_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "fc_delete" ON finance_categories;
CREATE POLICY "fc_delete" ON finance_categories FOR DELETE TO authenticated USING (true);

-- cash_transfers table
CREATE TABLE IF NOT EXISTS cash_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account uuid NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  to_account uuid NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cash_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ct_select" ON cash_transfers;
CREATE POLICY "ct_select" ON cash_transfers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ct_insert" ON cash_transfers;
CREATE POLICY "ct_insert" ON cash_transfers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ct_update" ON cash_transfers;
CREATE POLICY "ct_update" ON cash_transfers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ct_delete" ON cash_transfers;
CREATE POLICY "ct_delete" ON cash_transfers FOR DELETE TO authenticated USING (true);

-- cash_transactions additions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cash_transactions' AND column_name='account_id') THEN
    ALTER TABLE cash_transactions ADD COLUMN account_id uuid REFERENCES cash_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cash_transactions' AND column_name='category_id') THEN
    ALTER TABLE cash_transactions ADD COLUMN category_id uuid REFERENCES finance_categories(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cash_transactions' AND column_name='transaction_type') THEN
    ALTER TABLE cash_transactions ADD COLUMN transaction_type text DEFAULT 'masuk' CHECK (transaction_type IN ('masuk', 'keluar', 'transfer'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cash_transactions' AND column_name='reference_number') THEN
    ALTER TABLE cash_transactions ADD COLUMN reference_number text DEFAULT '';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cash_transactions' AND column_name='attachment') THEN
    ALTER TABLE cash_transactions ADD COLUMN attachment text;
  END IF;
END $$;

-- Seed default cash account if none exists
INSERT INTO cash_accounts (name, opening_balance, current_balance, is_active)
SELECT 'Kas Utama', 0, 0, true
WHERE NOT EXISTS (SELECT 1 FROM cash_accounts);

-- Seed default finance categories
INSERT INTO finance_categories (name, type)
SELECT * FROM (VALUES
  ('Penjualan', 'pendapatan'),
  ('Pendapatan Lain', 'pendapatan'),
  ('Belanja', 'pengeluaran'),
  ('Operasional', 'pengeluaran'),
  ('Gaji', 'pengeluaran'),
  ('Listrik', 'pengeluaran'),
  ('Air', 'pengeluaran'),
  ('Internet', 'pengeluaran'),
  ('Transportasi', 'pengeluaran'),
  ('Sewa', 'pengeluaran'),
  ('Perawatan', 'pengeluaran'),
  ('Lainnya', 'pengeluaran')
) AS t(name, type)
WHERE NOT EXISTS (SELECT 1 FROM finance_categories fc WHERE fc.name = t.name);
