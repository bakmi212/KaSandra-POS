import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, formatRupiah, formatNumber, formatDate } from '@/lib/supabase';
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
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, EmptyState } from '@/components/states';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, PackageCheck, Loader2, CheckCircle2, Truck } from 'lucide-react';

export default function GoodsReceiptPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Purchase | null>(null);
  const [receiveItems, setReceiveItems] = useState<{ id: string; product_id: string; product_name: string; quantity: number; received_quantity: number; receiveQty: number }[]>([]);
  const [receiveNote, setReceiveNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select('*, supplier:suppliers(*), purchase_items(*, product:products(*))')
        .in('status', ['dipesan', 'diterima_sebagian', 'draft'])
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

  const openReceive = (p: Purchase) => {
    setSelected(p);
    setReceiveItems((p.purchase_items || []).map((it: any) => ({
      id: it.id,
      product_id: it.product_id || '',
      product_name: it.product?.name || it.product_name || '-',
      quantity: Number(it.quantity),
      received_quantity: Number(it.received_quantity),
      receiveQty: Number(it.quantity) - Number(it.received_quantity),
    })));
    setReceiveNote('');
  };

  const setAllReceived = () => {
    setReceiveItems((prev) => prev.map((it) => ({ ...it, receiveQty: it.quantity - it.received_quantity })));
  };

  const processReceive = async () => {
    if (!selected) return;
    const toReceive = receiveItems.filter((i) => i.receiveQty > 0);
    if (toReceive.length === 0) {
      toast({ title: 'Tidak ada item untuk diterima', variant: 'destructive' });
      return;
    }
    // validate
    for (const it of toReceive) {
      if (it.receiveQty > it.quantity - it.received_quantity) {
        toast({ title: 'Qty melebihi jumlah pembelian', description: it.product_name, variant: 'destructive' });
        return;
      }
    }
    setProcessing(true);
    try {
      for (const it of toReceive) {
        const newReceived = it.received_quantity + it.receiveQty;
        await supabase.from('purchase_items').update({ received_quantity: newReceived }).eq('id', it.id);
        // add stock + movement
        if (it.product_id) {
          await updateProductStock(it.product_id, it.receiveQty);
          await recordStockMovement({
            productId: it.product_id,
            type: 'PURCHASE',
            qty: it.receiveQty,
            reference: selected.purchase_number || selected.invoice_no,
            note: `Penerimaan barang ${selected.purchase_number || selected.invoice_no}`,
            createdBy: user?.id,
          });
        }
      }
      const allItems = (selected.purchase_items || []);
      const allComplete = allItems.every((pi: any) => {
        const ri = receiveItems.find((r) => r.id === pi.id);
        return (Number(pi.received_quantity) + (ri?.receiveQty || 0)) >= Number(pi.quantity);
      });

      const newStatus = allComplete ? 'selesai' : 'diterima_sebagian';
      await supabase.from('purchases').update({ status: newStatus }).eq('id', selected.id);

      toast({ title: 'Barang diterima', description: `Status: ${PURCHASE_STATUS_LABELS[newStatus]}` });
      setSelected(null);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal menerima', description: e.message, variant: 'destructive' });
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
            <EmptyState icon={Truck} title="Tidak ada pembelian untuk diterima" description="Pembelian dengan status Draft/Dipesan/Diterima Sebagian akan muncul di sini" />
          ) : (
            <ScrollArea className="max-h-[70vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nomor</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className="text-right">Total</TableHead>
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
                      <TableCell className="text-right font-medium">{formatRupiah(Number(p.total))}</TableCell>
                      <TableCell><Badge variant="outline">{PURCHASE_STATUS_LABELS[p.status] || p.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => openReceive(p)}><PackageCheck className="w-4 h-4" /> Terima</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Receive Dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Penerimaan Barang</DialogTitle>
            <DialogDescription>{selected?.purchase_number || selected?.invoice_no} - {selected?.supplier?.name || '-'}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={setAllReceived}>Terima Semua</Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-right">Qty Pesan</TableHead>
                    <TableHead className="text-right">Sudah Diterima</TableHead>
                    <TableHead className="text-right">Terima Sekarang</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receiveItems.map((it, idx) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm font-medium">{it.product_name}</TableCell>
                      <TableCell className="text-right">{formatNumber(it.quantity)}</TableCell>
                      <TableCell className="text-right">{formatNumber(it.received_quantity)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={it.quantity - it.received_quantity}
                          value={it.receiveQty || ''}
                          onChange={(e) => {
                            const v = Math.min(Number(e.target.value) || 0, it.quantity - it.received_quantity);
                            setReceiveItems((prev) => prev.map((x, i) => i === idx ? { ...x, receiveQty: v } : x));
                          }}
                          className="h-8 w-20 text-center"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="space-y-1.5">
                <Label>Catatan Penerimaan</Label>
                <Textarea value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} rows={2} placeholder="Catatan (opsional)" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Batal</Button>
            <Button onClick={processReceive} disabled={processing}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Proses Penerimaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
