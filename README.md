# KaSandra — Sistem POS & Manajemen Toko

KaSandra adalah aplikasi Point of Sale (POS) dan manajemen toko lengkap yang dibangun dengan React, Vite, TypeScript, Tailwind CSS, shadcn/ui, dan Supabase.

## Fitur Utama

- **Authentication** — Login/logout dengan Supabase Auth, role-based access (Admin & Kasir)
- **Dashboard** — Ringkasan penjualan, stok, keuangan, grafik, top produk
- **Master Data** — Produk, Kategori, Supplier, Pelanggan (CRUD lengkap)
- **POS** — Transaksi penjualan, keranjang, pembayaran, cetak struk, export PDF
- **Pembelian** — Pembelian barang, penerimaan barang, retur pembelian
- **Manajemen Stok** — Stok saat ini, stock opname, penyesuaian stok, mutasi stok
- **Keuangan** — Kas masuk/keluar, transfer antar kas, buku kas, arus kas, laba rugi
- **Laporan** — Penjualan, produk terlaris/tidak laku, pembelian, stok, keuangan, laba rugi
- **Export** — PDF (jsPDF + AutoTable), Excel (SheetJS), Print
- **Pengaturan** — Profil toko, preferensi sistem, printer, backup/restore JSON
- **Manajemen User** — Tambah/edit/nonaktifkan user, reset password, ubah role
- **Role & Permission** — Admin (full access), Kasir (POS, produk lihat, pelanggan)
- **Audit Log** — Pelacakan aktivitas user
- **Global Search** — Cari produk, supplier, pelanggan, invoice, pembelian
- **Notification Center** — Stok habis/menipis, pembelian pending, backup reminder
- **Responsive** — Desktop, laptop, tablet, mobile
- **Dark/Light Theme**

## Tech Stack

| Kategori | Teknologi |
|----------|-----------|
| Frontend | React 18, Vite, TypeScript |
| Styling | Tailwind CSS, shadcn/ui |
| Backend | Supabase (PostgreSQL, Auth, Storage) |
| State | Zustand |
| Forms | React Hook Form, Zod |
| Charts | Recharts |
| Export | jsPDF, jspdf-autotable, xlsx (SheetJS) |
| Icons | Lucide React |

## Cara Install

```bash
# Clone repository
git clone <repo-url>
cd kasandra

# Install dependencies
npm install

# Jalankan development server
npm run dev

# Build untuk production
npm run build

# Preview build production
npm run preview
```

## Konfigurasi Supabase

1. Buat project baru di [Supabase](https://supabase.com)
2. Buka project settings > API
3. Salon URL dan anon key ke file `.env`:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

4. Jalankan migration SQL yang ada di folder `supabase/migrations/` melalui Supabase SQL Editor (urutkan berdasarkan nama file)

5. Buat Storage Bucket:
   - `store-assets` (public) — untuk logo toko
   - `receipts` (public) — untuk lampiran transaksi

6. Buat user admin pertama melalui Supabase Auth > Users > Add user

## Konfigurasi Environment

File `.env` berisi:

| Variable | Deskripsi |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL project Supabase |
| `VITE_SUPABASE_ANON_KEY` | Anon key untuk client |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin operations) |

## Struktur Folder

```
kasandra/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn/ui components
│   │   ├── Layout.tsx       # Main layout with sidebar, header, search, notifications
│   │   └── states.tsx       # ErrorState, EmptyState components
│   ├── hooks/
│   │   └── use-toast.ts     # Toast hook
│   ├── lib/
│   │   ├── auth-store.ts     # Zustand auth store
│   │   ├── cart-store.ts    # Zustand cart store
│   │   ├── supabase.ts       # Supabase client + utils
│   │   ├── types.ts         # TypeScript types
│   │   ├── utils.ts         # Utility functions
│   │   ├── finance.ts       # Finance helpers
│   │   ├── stock.ts         # Stock helpers
│   │   ├── receipt.ts       # Receipt generation
│   │   └── audit.ts         # Audit log + settings helpers
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── POSPage.tsx
│   │   ├── ProductsPage.tsx
│   │   ├── CategoriesPage.tsx
│   │   ├── SuppliersPage.tsx
│   │   ├── CustomersPage.tsx
│   │   ├── StockPage.tsx
│   │   ├── PurchasesPage.tsx
│   │   ├── GoodsReceiptPage.tsx
│   │   ├── PurchaseReturnsPage.tsx
│   │   ├── FinancePage.tsx
│   │   ├── ReportsPage.tsx
│   │   └── SettingsPage.tsx
│   ├── App.tsx              # Root app with routing, lazy loading, error boundary
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles
├── supabase/
│   └── migrations/          # SQL migrations
├── index.html               # HTML template with SEO meta tags
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Cara Deploy ke Vercel

1. Push project ke GitHub
2. Buka [Vercel](https://vercel.com) > New Project
3. Import repository GitHub
4. Tambahkan environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Framework preset: **Vite**
6. Build command: `npm run build`
7. Output directory: `dist`
8. Klik **Deploy**

## Cara Build Production

```bash
# Install dependencies
npm install

# Build
npm run build

# Output di folder dist/
# Deploy dist/ ke hosting pilihan (Vercel, Netlify, dll)
```

## Database Schema

Database terdiri dari tabel berikut:

- `profiles` — Data user (nama, role, status)
- `products` — Master produk
- `categories` — Master kategori
- `suppliers` — Master supplier
- `customers` — Master pelanggan
- `sales` — Transaksi penjualan
- `sale_items` — Detail item penjualan
- `sale_returns` — Retur penjualan
- `purchases` — Transaksi pembelian
- `purchase_items` — Detail item pembelian
- `purchase_returns` — Retur pembelian
- `stock_movements` — Mutasi stok
- `stock_adjustments` — Penyesuaian stok
- `stock_opnames` — Stock opname
- `cash_accounts` — Akun kas
- `finance_categories` — Kategori keuangan
- `cash_transactions` — Transaksi kas
- `cash_transfers` — Transfer antar kas
- `audit_logs` — Log aktivitas
- `system_settings` — Pengaturan sistem

Semua tabel menggunakan **Row Level Security (RLS)** dengan policy berbasis `auth.uid()`.

## Role & Permission

| Modul | Admin | Kasir |
|-------|-------|-------|
| Dashboard | Full | Full |
| POS | Full | Full |
| Produk | Full | Lihat |
| Pelanggan | Full | Full |
| Pembelian | Full | - |
| Stok | Full | - |
| Keuangan | Full | - |
| Laporan | Full | - |
| Pengaturan | Full | - |
| Hapus Data | Full | - |

## Lisensi

MIT
