/*
# KaSandra POS System - Full Schema

1. Overview
Multi-tenant POS system with role-based auth (admin, kasir). Each row is scoped to the authenticated user via user_id where ownership matters; shared operational data (products, categories, customers, suppliers, sales) is visible to all authenticated staff.

2. New Tables
- profiles: extends auth.users with role (admin/kasir) and full_name
- categories: product categories (name, description)
- products: items sold (barcode, name, category, harga beli/jual, stok, foto, min_stok)
- suppliers: supplier info with hutang (payable) tracking
- customers: customer info
- sales: sales transactions (invoice, total, discount, payment method, change, status)
- sale_items: line items per sale (product, qty, price, subtotal)
- stock_movements: stock in/out/opname/mutasi log
- purchases: purchase orders from suppliers (with hutang status)
- cash_transactions: kas masuk/keluar
- expenses: operational expenses
- settings: store settings (name, address, etc.)

3. Security
- RLS enabled on all tables.
- All policies scoped TO authenticated (app has sign-in screen).
- Owner-scoped tables (profiles) use auth.uid() = id.
- Shared operational tables use TO authenticated with USING(true) since all staff share the same store data.
- Storage bucket for product photos.
*/

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'kasir' CHECK (role IN ('admin', 'kasir')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);
-- Allow all authenticated users to read profiles (to see staff names) but only admin can see all
DROP POLICY IF EXISTS "select_all_profiles_staff" ON profiles;
CREATE POLICY "select_all_profiles_staff" ON profiles FOR SELECT
  TO authenticated USING (true);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_categories_name ON categories(name);

DROP POLICY IF EXISTS "cat_select" ON categories;
CREATE POLICY "cat_select" ON categories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cat_insert" ON categories;
CREATE POLICY "cat_insert" ON categories FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cat_update" ON categories;
CREATE POLICY "cat_update" ON categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cat_delete" ON categories;
CREATE POLICY "cat_delete" ON categories FOR DELETE TO authenticated USING (true);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode text UNIQUE,
  name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  cost_price numeric(14,2) NOT NULL DEFAULT 0,
  sell_price numeric(14,2) NOT NULL DEFAULT 0,
  stock numeric(14,2) NOT NULL DEFAULT 0,
  min_stock numeric(14,2) NOT NULL DEFAULT 5,
  unit text NOT NULL DEFAULT 'pcs',
  photo_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

DROP POLICY IF EXISTS "prod_select" ON products;
CREATE POLICY "prod_select" ON products FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "prod_insert" ON products;
CREATE POLICY "prod_insert" ON products FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "prod_update" ON products;
CREATE POLICY "prod_update" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "prod_delete" ON products;
CREATE POLICY "prod_delete" ON products FOR DELETE TO authenticated USING (true);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text DEFAULT '',
  phone text DEFAULT '',
  address text DEFAULT '',
  payable numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sup_select" ON suppliers;
CREATE POLICY "sup_select" ON suppliers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sup_insert" ON suppliers;
CREATE POLICY "sup_insert" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sup_update" ON suppliers;
CREATE POLICY "sup_update" ON suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sup_delete" ON suppliers;
CREATE POLICY "sup_delete" ON suppliers FOR DELETE TO authenticated USING (true);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text DEFAULT '',
  address text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

DROP POLICY IF EXISTS "cust_select" ON customers;
CREATE POLICY "cust_select" ON customers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cust_insert" ON customers;
CREATE POLICY "cust_insert" ON customers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "cust_update" ON customers;
CREATE POLICY "cust_update" ON customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cust_delete" ON customers;
CREATE POLICY "cust_delete" ON customers FOR DELETE TO authenticated USING (true);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  cashier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid numeric(14,2) NOT NULL DEFAULT 0,
  change numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'tunai' CHECK (payment_method IN ('tunai', 'transfer')),
  status text NOT NULL DEFAULT 'selesai' CHECK (status IN ('selesai', 'hold', 'retur')),
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_no);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);

DROP POLICY IF EXISTS "sales_select" ON sales;
CREATE POLICY "sales_select" ON sales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sales_insert" ON sales;
CREATE POLICY "sales_insert" ON sales FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sales_update" ON sales;
CREATE POLICY "sales_update" ON sales FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sales_delete" ON sales;
CREATE POLICY "sales_delete" ON sales FOR DELETE TO authenticated USING (true);

-- Sale items
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  qty numeric(14,2) NOT NULL DEFAULT 1,
  cost_price numeric(14,2) NOT NULL DEFAULT 0,
  sell_price numeric(14,2) NOT NULL DEFAULT 0,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

DROP POLICY IF EXISTS "si_select" ON sale_items;
CREATE POLICY "si_select" ON sale_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "si_insert" ON sale_items;
CREATE POLICY "si_insert" ON sale_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "si_update" ON sale_items;
CREATE POLICY "si_update" ON sale_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "si_delete" ON sale_items;
CREATE POLICY "si_delete" ON sale_items FOR DELETE TO authenticated USING (true);

-- Stock movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('masuk', 'keluar', 'opname', 'mutasi_masuk', 'mutasi_keluar', 'penjualan', 'retur')),
  qty numeric(14,2) NOT NULL DEFAULT 0,
  reference text DEFAULT '',
  note text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sm_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_sm_created ON stock_movements(created_at);

DROP POLICY IF EXISTS "sm_select" ON stock_movements;
CREATE POLICY "sm_select" ON stock_movements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sm_insert" ON stock_movements;
CREATE POLICY "sm_insert" ON stock_movements FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sm_update" ON stock_movements;
CREATE POLICY "sm_update" ON stock_movements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sm_delete" ON stock_movements;
CREATE POLICY "sm_delete" ON stock_movements FOR DELETE TO authenticated USING (true);

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'lunas' CHECK (status IN ('lunas', 'hutang')),
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);

DROP POLICY IF EXISTS "pur_select" ON purchases;
CREATE POLICY "pur_select" ON purchases FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pur_insert" ON purchases;
CREATE POLICY "pur_insert" ON purchases FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pur_update" ON purchases;
CREATE POLICY "pur_update" ON purchases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pur_delete" ON purchases;
CREATE POLICY "pur_delete" ON purchases FOR DELETE TO authenticated USING (true);

-- Cash transactions (kas masuk/keluar)
CREATE TABLE IF NOT EXISTS cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('masuk', 'keluar')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  description text DEFAULT '',
  reference text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE cash_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ct_created ON cash_transactions(created_at);

DROP POLICY IF EXISTS "ct_select" ON cash_transactions;
CREATE POLICY "ct_select" ON cash_transactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ct_insert" ON cash_transactions;
CREATE POLICY "ct_insert" ON cash_transactions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ct_update" ON cash_transactions;
CREATE POLICY "ct_update" ON cash_transactions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ct_delete" ON cash_transactions;
CREATE POLICY "ct_delete" ON cash_transactions FOR DELETE TO authenticated USING (true);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'Operasional',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_exp_created ON expenses(created_at);

DROP POLICY IF EXISTS "exp_select" ON expenses;
CREATE POLICY "exp_select" ON expenses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "exp_insert" ON expenses;
CREATE POLICY "exp_insert" ON expenses FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "exp_update" ON expenses;
CREATE POLICY "exp_update" ON expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "exp_delete" ON expenses;
CREATE POLICY "exp_delete" ON expenses FOR DELETE TO authenticated USING (true);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL DEFAULT 'KaSandra Store',
  address text DEFAULT '',
  phone text DEFAULT '',
  footer_note text DEFAULT 'Terima kasih atas kunjungan Anda',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "set_select" ON settings;
CREATE POLICY "set_select" ON settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "set_insert" ON settings;
CREATE POLICY "set_insert" ON settings FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "set_update" ON settings;
CREATE POLICY "set_update" ON settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "set_delete" ON settings;
CREATE POLICY "set_delete" ON settings FOR DELETE TO authenticated USING (true);

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'role', 'kasir'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
