import { supabase } from './supabase';

export async function recordStockMovement(opts: {
  productId: string;
  type: string;
  qty: number;
  reference?: string;
  note?: string;
  createdBy?: string;
}): Promise<void> {
  const { productId, type, qty, reference = '', note = '', createdBy } = opts;
  const { data: prod } = await supabase.from('products').select('stock').eq('id', productId).maybeSingle();
  const balanceBefore = Number(prod?.stock || 0);
  const balanceAfter = balanceBefore + Number(qty);
  const { error } = await supabase.from('stock_movements').insert({
    product_id: productId,
    type,
    qty,
    reference,
    note,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    created_by: createdBy || null,
  });
  if (error) throw error;
}

export async function updateProductStock(productId: string, delta: number): Promise<number> {
  const { data: prod } = await supabase.from('products').select('stock').eq('id', productId).maybeSingle();
  const current = Number(prod?.stock || 0);
  const newStock = Math.max(0, current + delta);
  const { error } = await supabase
    .from('products')
    .update({ stock: newStock, updated_at: new Date().toISOString() })
    .eq('id', productId);
  if (error) throw error;
  return newStock;
}

export function generatePurchaseNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PO-${ymd}-${rand}`;
}

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  dipesan: 'Dipesan',
  diterima_sebagian: 'Diterima Sebagian',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
  lunas: 'Lunas',
  hutang: 'Hutang',
};

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  masuk: 'Stok Masuk',
  keluar: 'Stok Keluar',
  opname: 'Stock Opname',
  mutasi_masuk: 'Mutasi Masuk',
  mutasi_keluar: 'Mutasi Keluar',
  penjualan: 'Penjualan (SALE)',
  retur: 'Retur (RETURN)',
  SALE: 'Penjualan',
  PURCHASE: 'Pembelian',
  RETURN: 'Retur',
  STOCK_OPNAME: 'Stock Opname',
  ADJUSTMENT: 'Penyesuaian',
};
