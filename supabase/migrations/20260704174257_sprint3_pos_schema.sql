/*
# Sprint 3 - POS (Kasir) module schema

1. Overview
Adds tables and columns required by the Sprint 3 POS spec: payments, sale_holds, returns, return_items.
Adds mirror columns on sales (invoice_number, grand_total, amount_paid, change_amount, notes) and sale_items (price, quantity, discount) to match the spec naming, while keeping existing Sprint 1/2 columns intact (no data loss).

2. New Tables
- payments: payment records per sale (method, amount, reference_number)
- sale_holds: held transactions stored as JSON (data_json, created_by)
- returns: return headers (sale_id, reason)
- return_items: return line items (return_id, product_id, qty)

3. Modified Tables
- sales: add invoice_number text, grand_total numeric, amount_paid numeric, change_amount numeric, notes text (all nullable / with defaults). Existing invoice_no, total, paid, change, note columns are kept and backfilled.
- sale_items: add price numeric, quantity numeric, discount numeric (defaults 0). Existing sell_price, qty, subtotal columns kept and backfilled.

4. Security
- RLS enabled on all new tables with authenticated CRUD policies (shared store data model, same as Sprint 1).
- No changes to existing policies.

5. Notes
- All additions use DO $$ ... IF NOT EXISTS ... END $$ guards for idempotency.
- No DROP, no type changes, no renames — existing data preserved.
- Backfill statements copy old column values into new spec-named columns where the new column is null/zero.
*/

-- sales additions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='invoice_number') THEN
    ALTER TABLE sales ADD COLUMN invoice_number text;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='grand_total') THEN
    ALTER TABLE sales ADD COLUMN grand_total numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='amount_paid') THEN
    ALTER TABLE sales ADD COLUMN amount_paid numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='change_amount') THEN
    ALTER TABLE sales ADD COLUMN change_amount numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='notes') THEN
    ALTER TABLE sales ADD COLUMN notes text DEFAULT '';
  END IF;
END $$;

-- backfill new columns from old
UPDATE sales SET invoice_number = invoice_no WHERE invoice_number IS NULL AND invoice_no IS NOT NULL;
UPDATE sales SET grand_total = total WHERE grand_total = 0 AND total <> 0;
UPDATE sales SET amount_paid = paid WHERE amount_paid = 0 AND paid <> 0;
UPDATE sales SET change_amount = change WHERE change_amount = 0 AND change <> 0;
UPDATE sales SET notes = note WHERE notes IS NULL;

-- sale_items additions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sale_items' AND column_name='price') THEN
    ALTER TABLE sale_items ADD COLUMN price numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sale_items' AND column_name='quantity') THEN
    ALTER TABLE sale_items ADD COLUMN quantity numeric(14,2) NOT NULL DEFAULT 1;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sale_items' AND column_name='discount') THEN
    ALTER TABLE sale_items ADD COLUMN discount numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- backfill
UPDATE sale_items SET price = sell_price WHERE price = 0 AND sell_price <> 0;
UPDATE sale_items SET quantity = qty WHERE quantity = 0;

-- payments table
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'tunai' CHECK (method IN ('tunai', 'transfer')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  reference_number text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

DROP POLICY IF EXISTS "pay_select" ON payments;
CREATE POLICY "pay_select" ON payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pay_insert" ON payments;
CREATE POLICY "pay_insert" ON payments FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pay_update" ON payments;
CREATE POLICY "pay_update" ON payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pay_delete" ON payments;
CREATE POLICY "pay_delete" ON payments FOR DELETE TO authenticated USING (true);

-- sale_holds table
CREATE TABLE IF NOT EXISTS sale_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sale_holds ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sale_holds_created ON sale_holds(created_at);

DROP POLICY IF EXISTS "sh_select" ON sale_holds;
CREATE POLICY "sh_select" ON sale_holds FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sh_insert" ON sale_holds;
CREATE POLICY "sh_insert" ON sale_holds FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sh_update" ON sale_holds;
CREATE POLICY "sh_update" ON sale_holds FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sh_delete" ON sale_holds;
CREATE POLICY "sh_delete" ON sale_holds FOR DELETE TO authenticated USING (true);

-- returns table
CREATE TABLE IF NOT EXISTS returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  reason text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);

DROP POLICY IF EXISTS "ret_select" ON returns;
CREATE POLICY "ret_select" ON returns FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ret_insert" ON returns;
CREATE POLICY "ret_insert" ON returns FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ret_update" ON returns;
CREATE POLICY "ret_update" ON returns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ret_delete" ON returns;
CREATE POLICY "ret_delete" ON returns FOR DELETE TO authenticated USING (true);

-- return_items table
CREATE TABLE IF NOT EXISTS return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  qty numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_return_items_return ON return_items(return_id);

DROP POLICY IF EXISTS "ri_select" ON return_items;
CREATE POLICY "ri_select" ON return_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ri_insert" ON return_items;
CREATE POLICY "ri_insert" ON return_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ri_update" ON return_items;
CREATE POLICY "ri_update" ON return_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ri_delete" ON return_items;
CREATE POLICY "ri_delete" ON return_items FOR DELETE TO authenticated USING (true);
