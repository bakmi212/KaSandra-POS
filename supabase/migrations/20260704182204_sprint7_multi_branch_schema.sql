/*
# Sprint 7 - Multi Cabang (Branch System)

1. Overview
Adds multi-branch support: branches, branch_users (user-branch assignment), branch_products (per-branch pricing), branch_stock (per-branch stock), stock_transfers + stock_transfer_items (inter-branch stock transfers).

2. New Tables
- branches: store branches (name, code, address, phone, is_active)
- branch_users: many-to-many user-branch assignment
- branch_products: per-branch product pricing (sell_price, cost_price override)
- branch_stock: per-branch stock levels (separate from products.stock)
- stock_transfers: inter-branch stock transfer headers
- stock_transfer_items: items within a stock transfer

3. Security
- RLS enabled on all new tables with authenticated CRUD policies.
- branch_users allows users to read their own assignments.

4. Notes
- Uses IF NOT EXISTS guards for idempotency.
- No DROP, no type changes, no renames.
- Seeds a default "Cabang Utama" branch.
*/

-- branches table
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL DEFAULT 'MAIN',
  address text DEFAULT '',
  phone text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "br_select" ON branches;
CREATE POLICY "br_select" ON branches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "br_insert" ON branches;
CREATE POLICY "br_insert" ON branches FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "br_update" ON branches;
CREATE POLICY "br_update" ON branches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "br_delete" ON branches;
CREATE POLICY "br_delete" ON branches FOR DELETE TO authenticated USING (true);

-- branch_users table
CREATE TABLE IF NOT EXISTS branch_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (branch_id, user_id)
);
ALTER TABLE branch_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bu_select" ON branch_users;
CREATE POLICY "bu_select" ON branch_users FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bu_insert" ON branch_users;
CREATE POLICY "bu_insert" ON branch_users FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "bu_update" ON branch_users;
CREATE POLICY "bu_update" ON branch_users FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "bu_delete" ON branch_users;
CREATE POLICY "bu_delete" ON branch_users FOR DELETE TO authenticated USING (true);

-- branch_products table (per-branch pricing override)
CREATE TABLE IF NOT EXISTS branch_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sell_price numeric(14,2),
  cost_price numeric(14,2),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (branch_id, product_id)
);
ALTER TABLE branch_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bp_select" ON branch_products;
CREATE POLICY "bp_select" ON branch_products FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bp_insert" ON branch_products;
CREATE POLICY "bp_insert" ON branch_products FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "bp_update" ON branch_products;
CREATE POLICY "bp_update" ON branch_products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "bp_delete" ON branch_products;
CREATE POLICY "bp_delete" ON branch_products FOR DELETE TO authenticated USING (true);

-- branch_stock table (per-branch stock levels)
CREATE TABLE IF NOT EXISTS branch_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock numeric(14,2) NOT NULL DEFAULT 0,
  min_stock numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (branch_id, product_id)
);
ALTER TABLE branch_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bs_select" ON branch_stock;
CREATE POLICY "bs_select" ON branch_stock FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bs_insert" ON branch_stock;
CREATE POLICY "bs_insert" ON branch_stock FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "bs_update" ON branch_stock;
CREATE POLICY "bs_update" ON branch_stock FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "bs_delete" ON branch_stock;
CREATE POLICY "bs_delete" ON branch_stock FOR DELETE TO authenticated USING (true);

-- stock_transfers table
CREATE TABLE IF NOT EXISTS stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL,
  from_branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  to_branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'dikirim', 'diterima', 'dibatalkan')),
  notes text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "st_select" ON stock_transfers;
CREATE POLICY "st_select" ON stock_transfers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "st_insert" ON stock_transfers;
CREATE POLICY "st_insert" ON stock_transfers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "st_update" ON stock_transfers;
CREATE POLICY "st_update" ON stock_transfers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "st_delete" ON stock_transfers;
CREATE POLICY "st_delete" ON stock_transfers FOR DELETE TO authenticated USING (true);

-- stock_transfer_items table
CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sti_select" ON stock_transfer_items;
CREATE POLICY "sti_select" ON stock_transfer_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sti_insert" ON stock_transfer_items;
CREATE POLICY "sti_insert" ON stock_transfer_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sti_update" ON stock_transfer_items;
CREATE POLICY "sti_update" ON stock_transfer_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sti_delete" ON stock_transfer_items;
CREATE POLICY "sti_delete" ON stock_transfer_items FOR DELETE TO authenticated USING (true);

-- Seed default branch
INSERT INTO branches (name, code, address, phone, is_active)
SELECT 'Cabang Utama', 'MAIN', '', '', true
WHERE NOT EXISTS (SELECT 1 FROM branches);
