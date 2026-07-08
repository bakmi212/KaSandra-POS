/*
# Sprint 12 — POS Enhancement: Order Type, Table Number, Customer Name

1. Modified Tables
- `sales` — added columns for enhanced POS order info:
  - `order_type` (text) — Dine In / Take Away / Delivery
  - `table_number` (text) — table/meja number for dine-in
  - `customer_name` (text) — walk-in customer name (when no customer_id)
  - `order_note` (text) — order notes/catatan pesanan

2. Security
- No RLS changes (existing policies cover new columns automatically)
*/

ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'dine_in';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS table_number text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_note text;
