/*
# Sprint 2 - Master Data schema additions

1. Overview
Adds columns required by the Sprint 2 Master Data spec without dropping or renaming existing columns (no data loss). New columns are nullable with safe defaults so existing rows remain valid.

2. Changes per table

products:
- Add `sku` text (nullable) — stock keeping unit, distinct from barcode.
- Add `purchase_price` numeric default 0 — mirrors existing `cost_price` (kept for backward compat with Sprint 1 POS).
- Add `selling_price` numeric default 0 — mirrors existing `sell_price`.
- Add `minimum_stock` numeric default 0 — mirrors existing `min_stock`.
- Add `image_url` text (nullable) — mirrors existing `photo_url`.
- Add unique index on sku (partial, where not null).

categories:
- Add `color` text default '#3b82f6' — category color for UI badges.

suppliers:
- Add `contact_name` text (nullable) — mirrors `contact_person` (kept).
- Add `email` text (nullable).
- Add `notes` text (nullable).

customers:
- Add `email` text (nullable).
- Add `notes` text (nullable).

settings:
- Add `logo` text (nullable) — store logo URL.
- Add `email` text (nullable).
- Add `currency` text default 'IDR' — currency code, default Rupiah.

3. Security
No policy changes — existing RLS policies already cover the new columns (column-level access is governed by table policies).

4. Notes
- All additions use IF NOT EXISTS guards via DO blocks so the migration is idempotent and safe to re-run.
- No DROP, no type changes, no renames — existing Sprint 1 data is preserved.
*/

-- products additions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='sku') THEN
    ALTER TABLE products ADD COLUMN sku text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='purchase_price') THEN
    ALTER TABLE products ADD COLUMN purchase_price numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='selling_price') THEN
    ALTER TABLE products ADD COLUMN selling_price numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='minimum_stock') THEN
    ALTER TABLE products ADD COLUMN minimum_stock numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='image_url') THEN
    ALTER TABLE products ADD COLUMN image_url text;
  END IF;
END $$;

-- backfill new mirror columns from existing ones where null
UPDATE products SET purchase_price = cost_price WHERE purchase_price = 0 AND cost_price <> 0;
UPDATE products SET selling_price = sell_price WHERE selling_price = 0 AND sell_price <> 0;
UPDATE products SET minimum_stock = min_stock WHERE minimum_stock = 0 AND min_stock <> 0;
UPDATE products SET image_url = photo_url WHERE image_url IS NULL AND photo_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL;

-- categories additions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='color') THEN
    ALTER TABLE categories ADD COLUMN color text NOT NULL DEFAULT '#3b82f6';
  END IF;
END $$;

-- suppliers additions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='suppliers' AND column_name='contact_name') THEN
    ALTER TABLE suppliers ADD COLUMN contact_name text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='suppliers' AND column_name='email') THEN
    ALTER TABLE suppliers ADD COLUMN email text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='suppliers' AND column_name='notes') THEN
    ALTER TABLE suppliers ADD COLUMN notes text;
  END IF;
END $$;

-- backfill contact_name from contact_person
UPDATE suppliers SET contact_name = contact_person WHERE contact_name IS NULL AND contact_person IS NOT NULL AND contact_person <> '';

-- customers additions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='email') THEN
    ALTER TABLE customers ADD COLUMN email text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='notes') THEN
    ALTER TABLE customers ADD COLUMN notes text;
  END IF;
END $$;

-- settings additions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settings' AND column_name='logo') THEN
    ALTER TABLE settings ADD COLUMN logo text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settings' AND column_name='email') THEN
    ALTER TABLE settings ADD COLUMN email text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='settings' AND column_name='currency') THEN
    ALTER TABLE settings ADD COLUMN currency text NOT NULL DEFAULT 'IDR';
  END IF;
END $$;
