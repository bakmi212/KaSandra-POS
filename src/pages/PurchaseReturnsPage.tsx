import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, formatNumber, formatDate } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';
import { recordStockMovement, updateProductStock, PURCHASE_STATUS_LABELS } from '@/lib/stock';
import type { Purchase } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/states';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, RotateCcw, Loader2, Truck } from 'lucide-react';

export default function PurchaseReturnsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [returItems, setReturItems] = useState<{ id: string; product_id: string; product_name: string; received_quantity: number; returQty: number }[]>([]);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select('*, supplier:suppliers(*), purchase_items(*, product:products(*))')
        .in('status', ['selesai', 'diterima_sebagian', 'lunas'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPurchases((data as Purchase[]) || []);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return purchases;
    return purchases.filter((p) => (p.purchase_number || p.invoice_no || '').toLowerCase().includes(q) || (p.supplier?.name || '').toLowerCase().includes(q));
  }, [purchases, search]);

  const openRetur = (p: Purchase) => {
    setSelected(p);
    setReturItems((p.purchase_items || [])
      .filter((it: any) => Number(it.received_quantity) > 0)
      .map((it: any) => ({
        id: it.id,
        product_id: it.product_id || '',
        product_name: it.product?.name || it.product_name || '-',
        received_quantity: Number(it.received_quantity),
        returQty: 0,
      })));
    setReason('');
  };

  const processRetur = async () => {
    if (!selected) return;
    const toRetur = returItems.filter((i) => i.returQty > 0);
    if (toRetur.length === 0) {
      toast({ title: 'Pilih item untuk retur', variant: 'destructive' });
      return;
    }
    if (!reason) {
      toast({ title: 'Alasan retur wajib diisi', variant: 'destructive' });
      return;
    }
    // validate
    for (const it of toRetur) {
      if (it.returQty > it.received_quantity) {
        toast({ title: 'Qty retur melebihi jumlah diterima', description: it.product_name, variant: 'destructive' });
        return;
      }
    }
    setProcessing(true);
    try {
      const { data: retData, error: retErr } = await supabase
        .from('purchase_returns')
        .insert({ purchase_id: selected.id, supplier_id: selected.supplier_id, reason })
        .select('*').maybeSingle();
      if (retErr) throw retErr;

      for (const it of toRetur) {
        await supabase.from('purchase_return_items').insert({
          purchase_return_id: retData.id,
          product_id: it.product_id,
          quantity: it.returQty,
        });
        if (it.product_id) {
          await updateProductStock(it.product_id, -it.returQty);
          await recordStockMovement({
            productId: it.product_id,
            type: 'RETURN',
            qty: -it.returQty,
            reference: selected.purchase_number || selected.invoice_no,
            note: `Retur pembelian ${selected.purchase_number || selected.invoice_no} - ${reason}`,
            createdBy: user?.id,
          });
        }
      }
      toast({ title: 'Retur pembelian berhasil' });
      setSelected(null);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal retur', description: e.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Cari pembelian..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Truck} title="Tidak ada pembelian untuk retur" description="Pembelian yang sudah diterima barang akan muncul di sini" />
          ) : (
            <ScrollArea className="max-h-[70vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nomor</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-sm">{p.purchase_number || p.invoice_no}</TableCell>
                      <TableCell className="text-sm">{p.supplier?.name || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(p.purchase_date || p.created_at)}</TableCell>
                      <TableCell><Badge variant="outline">{PURCHASE_STATUS_LABELS[p.status] || p.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openRetur(p)}><RotateCcw className="w-4 h-4" /> Retur</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Retur Pembelian</DialogTitle>
            <DialogDescription>{selected?.purchase_number || selected?.invoice_no} - {selected?.supplier?.name || '-'}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-right">Diterima</TableHead>
                    <TableHead className="text-right">Qty Retur</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returItems.map((it, idx) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm font-medium">{it.product_name}</TableCell>
                      <TableCell className="text-right">{formatNumber(it.received_quantity)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={it.received_quantity}
                          value={it.returQty || ''}
                          onChange={(e) => {
                            const v = Math.min(Number(e.target.value) || 0, it.received_quantity);
                            setReturItems((prev) => prev.map((x, i) => i === idx ? { ...x, returQty: v } : x));
                          }}
                          className="h-8 w-20 text-center"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="space-y-1.5">
                <Label>Alasan Retur *</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Barang rusak / salah kirim / dll" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Batal</Button>
            <Button onClick={processRetur} disabled={processing}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Proses Retur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
