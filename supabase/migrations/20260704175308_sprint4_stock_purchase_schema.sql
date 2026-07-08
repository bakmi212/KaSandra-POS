/*
# Sprint 4 - Stock & Purchasing module schema

1. Overview
Adds tables and columns required by the Sprint 4 Stock & Purchasing spec: purchase_items, purchase_returns, purchase_return_items, stock_adjustments, stock_opnames. Adds spec-named columns to purchases (purchase_number, purchase_date, notes, created_by) and updates the stock_movements type constraint to support SALE, PURCHASE, RETURN, STOCK_OPNAME, ADJUSTMENT (alongside existing Indonesian-named types). Adds balance_before/balance_after columns to stock_movements for audit trail.

2. New Tables
- purchase_items: line items per purchase (product_id, quantity, received_quantity, purchase_price, discount, subtotal)
- purchase_returns: return headers for purchases (purchase_id, supplier_id, reason)
- purchase_return_items: return line items (purchase_return_id, product_id, quantity)
- stock_adjustments: manual stock adjustments (product_id, type, quantity, reason)
- stock_opnames: stock opname records (product_id, system_stock, physical_stock, difference, notes)

3. Modified Tables
- purchases: add purchase_number text, purchase_date date, notes text, created_by uuid. Existing invoice_no, note, status columns kept (status CHECK expanded to support draft/dipesan/diterima_sebagian/selesai/dibatalkan alongside existing lunas/hutang).
- stock_movements: add balance_before numeric, balance_after numeric. Expand type CHECK to include SALE, PURCHASE, RETURN, STOCK_OPNAME, ADJUSTMENT.

4. Security
- RLS enabled on all new tables with authenticated CRUD policies (shared store data model).
- No changes to existing policies.

5. Notes
- All additions use DO $$ ... IF NOT EXISTS ... END $$ guards for idempotency.
- No DROP, no type changes, no renames — existing data preserved.
- The stock_movements type constraint is dropped and recreated to include both old and new type names (backward compatible).
*/

-- purchases additions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchases' AND column_name='purchase_number') THEN
    ALTER TABLE purchases ADD COLUMN purchase_number text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchases' AND column_name='purchase_date') THEN
    ALTER TABLE purchases ADD COLUMN purchase_date date DEFAULT CURRENT_DATE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchases' AND column_name='notes') THEN
    ALTER TABLE purchases ADD COLUMN notes text DEFAULT '';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchases' AND column_name='created_by') THEN
    ALTER TABLE purchases ADD COLUMN created_by uuid;
  END IF;
END $$;

-- backfill purchase_number from invoice_no
UPDATE purchases SET purchase_number = invoice_no WHERE purchase_number IS NULL AND invoice_no IS NOT NULL;
UPDATE purchases SET notes = note WHERE notes IS NULL OR notes = '';

-- expand purchases status constraint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_status_check' AND conrelid = 'purchases'::regclass) THEN
    ALTER TABLE purchases DROP CONSTRAINT purchases_status_check;
  END IF;
END $$;
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_status_check
  CHECK (status IN ('draft', 'dipesan', 'diterima_sebagian', 'selesai', 'dibatalkan', 'lunas', 'hutang'));

-- purchase_items table
CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  quantity numeric(14,2) NOT NULL DEFAULT 0,
  received_quantity numeric(14,2) NOT NULL DEFAULT 0,
  purchase_price numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pi_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_pi_product ON purchase_items(product_id);

DROP POLICY IF EXISTS "pi_select" ON purchase_items;
CREATE POLICY "pi_select" ON purchase_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pi_insert" ON purchase_items;
CREATE POLICY "pi_insert" ON purchase_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pi_update" ON purchase_items;
CREATE POLICY "pi_update" ON purchase_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pi_delete" ON purchase_items;
CREATE POLICY "pi_delete" ON purchase_items FOR DELETE TO authenticated USING (true);

-- purchase_returns table
CREATE TABLE IF NOT EXISTS purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  reason text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pret_purchase ON purchase_returns(purchase_id);

DROP POLICY IF EXISTS "pret_select" ON purchase_returns;
CREATE POLICY "pret_select" ON purchase_returns FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pret_insert" ON purchase_returns;
CREATE POLICY "pret_insert" ON purchase_returns FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pret_update" ON purchase_returns;
CREATE POLICY "pret_update" ON purchase_returns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pret_delete" ON purchase_returns;
CREATE POLICY "pret_delete" ON purchase_returns FOR DELETE TO authenticated USING (true);

-- purchase_return_items table
CREATE TABLE IF NOT EXISTS purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_return_id uuid NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  quantity numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_return_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pri_return ON purchase_return_items(purchase_return_id);

DROP POLICY IF EXISTS "pri_select" ON purchase_return_items;
CREATE POLICY "pri_select" ON purchase_return_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pri_insert" ON purchase_return_items;
CREATE POLICY "pri_insert" ON purchase_return_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pri_update" ON purchase_return_items;
CREATE POLICY "pri_update" ON purchase_return_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pri_delete" ON purchase_return_items;
CREATE POLICY "pri_delete" ON purchase_return_items FOR DELETE TO authenticated USING (true);

-- stock_adjustments table
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('tambah', 'kurang')),
  quantity numeric(14,2) NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'Lainnya' CHECK (reason IN ('Barang Rusak', 'Hilang', 'Koreksi', 'Salah Input', 'Lainnya')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sa_product ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_sa_created ON stock_adjustments(created_at);

DROP POLICY IF EXISTS "sa_select" ON stock_adjustments;
CREATE POLICY "sa_select" ON stock_adjustments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sa_insert" ON stock_adjustments;
CREATE POLICY "sa_insert" ON stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sa_update" ON stock_adjustments;
CREATE POLICY "sa_update" ON stock_adjustments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sa_delete" ON stock_adjustments;
CREATE POLICY "sa_delete" ON stock_adjustments FOR DELETE TO authenticated USING (true);

-- stock_opnames table
CREATE TABLE IF NOT EXISTS stock_opnames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  system_stock numeric(14,2) NOT NULL DEFAULT 0,
  physical_stock numeric(14,2) NOT NULL DEFAULT 0,
  difference numeric(14,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stock_opnames ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_so_product ON stock_opnames(product_id);
CREATE INDEX IF NOT EXISTS idx_so_created ON stock_opnames(created_at);

DROP POLICY IF EXISTS "so_select" ON stock_opnames;
CREATE POLICY "so_select" ON stock_opnames FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "so_insert" ON stock_opnames;
CREATE POLICY "so_insert" ON stock_opnames FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "so_update" ON stock_opnames;
CREATE POLICY "so_update" ON stock_opnames FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "so_delete" ON stock_opnames;
CREATE POLICY "so_delete" ON stock_opnames FOR DELETE TO authenticated USING (true);

-- stock_movements additions: balance_before, balance_after
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_movements' AND column_name='balance_before') THEN
    ALTER TABLE stock_movements ADD COLUMN balance_before numeric(14,2) DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_movements' AND column_name='balance_after') THEN
    ALTER TABLE stock_movements ADD COLUMN balance_after numeric(14,2) DEFAULT 0;
  END IF;
END $$;

-- expand stock_movements type constraint to include new English-named types
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_type_check' AND conrelid = 'stock_movements'::regclass) THEN
    ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_type_check;
  END IF;
END $$;
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_type_check
  CHECK (type IN ('masuk', 'keluar', 'opname', 'mutasi_masuk', 'mutasi_keluar', 'penjualan', 'retur',
                  'SALE', 'PURCHASE', 'RETURN', 'STOCK_OPNAME', 'ADJUSTMENT'));
