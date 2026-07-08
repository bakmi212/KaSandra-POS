import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { useBranchStore } from '@/lib/branch-store';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import type { Product, StockTransfer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/states';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Trash2, Loader2, ArrowLeftRight, Search, Send, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  dikirim: 'Dikirim',
  diterima: 'Diterima',
  dibatalkan: 'Dibatalkan',
};

const STATUS_VARIANTS: Record<string, any> = {
  draft: 'secondary',
  dikirim: 'default',
  diterima: 'default',
  dibatalkan: 'destructive',
};

export default function StockTransfersPage() {
  const { user } = useAuthStore();
  const { branches, activeBranch } = useBranchStore();
  const { toast } = useToast();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [confirmAction, setConfirmAction] = useState<{ transfer: StockTransfer; action: 'send' | 'receive' | 'cancel' } | null>(null);

  // form
  const [form, setForm] = useState({ from_branch_id: '', to_branch_id: '', notes: '' });
  const [items, setItems] = useState<{ product_id: string; quantity: number }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('stock_transfers')
        .select('*, fromBranch:branches!from_branch_id(*), toBranch:branches!to_branch_id(*)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setTransfers((data as StockTransfer[]) || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = async () => {
    setForm({ from_branch_id: activeBranch?.id || branches[0]?.id || '', to_branch_id: '', notes: '' });
    setItems([]);
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('name').limit(100);
    setProducts((data as Product[]) || []);
    setAddOpen(true);
  };

  const addItem = (productId: string) => {
    if (items.some((i) => i.product_id === productId)) return;
    setItems([...items, { product_id: productId, quantity: 1 }]);
  };

  const updateItemQty = (productId: string, qty: number) => {
    if (qty < 0) return;
    setItems(items.map((i) => i.product_id === productId ? { ...i, quantity: qty } : i));
  };

  const removeItem = (productId: string) => {
    setItems(items.filter((i) => i.product_id !== productId));
  };

  const save = async () => {
    if (form.from_branch_id === form.to_branch_id) { toast({ title: 'Cabang asal dan tujuan tidak boleh sama', variant: 'destructive' }); return; }
    if (!form.from_branch_id || !form.to_branch_id) { toast({ title: 'Pilih cabang asal dan tujuan', variant: 'destructive' }); return; }
    if (items.length === 0) { toast({ title: 'Tambahkan minimal 1 item', variant: 'destructive' }); return; }
    if (items.some((i) => i.quantity <= 0)) { toast({ title: 'Qty harus > 0', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const transferNumber = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      const { data: transfer, error: trErr } = await supabase.from('stock_transfers').insert({
        transfer_number: transferNumber,
        from_branch_id: form.from_branch_id,
        to_branch_id: form.to_branch_id,
        status: 'draft',
        notes: form.notes,
        created_by: user?.id,
      }).select('*').maybeSingle();
      if (trErr) throw trErr;
      const itemRows = items.map((i) => ({ transfer_id: transfer.id, product_id: i.product_id, quantity: i.quantity }));
      const { error: itemsErr } = await supabase.from('stock_transfer_items').insert(itemRows);
      if (itemsErr) throw itemsErr;
      await logAudit('Transfer Stok', 'Tambah', `Transfer ${transferNumber} dibuat`);
      toast({ title: 'Transfer stok dibuat' });
      setAddOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const doAction = async () => {
    if (!confirmAction) return;
    const { transfer, action } = confirmAction;
    try {
      if (action === 'send') {
        // reduce stock from source branch
        const { data: stItems } = await supabase.from('stock_transfer_items').select('product_id, quantity').eq('transfer_id', transfer.id);
        for (const it of (stItems || [])) {
          const { data: bs } = await supabase.from('branch_stock').select('id, stock').eq('branch_id', transfer.from_branch_id).eq('product_id', it.product_id).maybeSingle();
          if (bs) {
            const newStock = Number(bs.stock) - Number(it.quantity);
            if (newStock < 0) { toast({ title: 'Stok asal tidak mencukupi', variant: 'destructive' }); setConfirmAction(null); return; }
            await supabase.from('branch_stock').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('id', bs.id);
          } else {
            toast({ title: 'Stok asal tidak ditemukan untuk salah satu produk', variant: 'destructive' }); setConfirmAction(null); return;
          }
        }
        await supabase.from('stock_transfers').update({ status: 'dikirim' }).eq('id', transfer.id);
        await logAudit('Transfer Stok', 'Kirim', `Transfer ${transfer.transfer_number} dikirim`);
        toast({ title: 'Transfer dikirim, stok asal dikurangi' });
      } else if (action === 'receive') {
        // add stock to destination branch
        const { data: stItems } = await supabase.from('stock_transfer_items').select('product_id, quantity').eq('transfer_id', transfer.id);
        for (const it of (stItems || [])) {
          const { data: bs } = await supabase.from('branch_stock').select('id, stock').eq('branch_id', transfer.to_branch_id).eq('product_id', it.product_id).maybeSingle();
          if (bs) {
            await supabase.from('branch_stock').update({ stock: Number(bs.stock) + Number(it.quantity), updated_at: new Date().toISOString() }).eq('id', bs.id);
          } else {
            await supabase.from('branch_stock').insert({ branch_id: transfer.to_branch_id, product_id: it.product_id, stock: Number(it.quantity), min_stock: 0 });
          }
        }
        await supabase.from('stock_transfers').update({ status: 'diterima' }).eq('id', transfer.id);
        await logAudit('Transfer Stok', 'Terima', `Transfer ${transfer.transfer_number} diterima`);
        toast({ title: 'Transfer diterima, stok tujuan ditambah' });
      } else if (action === 'cancel') {
        await supabase.from('stock_transfers').update({ status: 'dibatalkan' }).eq('id', transfer.id);
        await logAudit('Transfer Stok', 'Batal', `Transfer ${transfer.transfer_number} dibatalkan`);
        toast({ title: 'Transfer dibatalkan' });
      }
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    }
    setConfirmAction(null);
  };

  const filtered = transfers.filter((t) => {
    const q = search.toLowerCase().trim();
    const matchQ = !q || t.transfer_number.toLowerCase().includes(q);
    const matchS = statusFilter === 'all' || t.status === statusFilter;
    return matchQ && matchS;
  });

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 items-center flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Cari nomor transfer..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Semua Status</SelectItem>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={openAdd}><Plus className="w-4 h-4" /> Transfer Stok</Button>
      </div>

      <Card className="border-border/50"><CardContent className="p-0">
        {filtered.length === 0 ? <EmptyState icon={ArrowLeftRight} title="Belum ada transfer stok" /> :
          <ScrollArea className="max-h-[65vh]"><Table>
            <TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Dari</TableHead><TableHead>Ke</TableHead><TableHead>Status</TableHead><TableHead>Tanggal</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono text-sm">{t.transfer_number}</TableCell>
                <TableCell className="text-sm font-medium">{t.fromBranch?.name || '-'}</TableCell>
                <TableCell className="text-sm font-medium">{t.toBranch?.name || '-'}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANTS[t.status]}>{STATUS_LABELS[t.status]}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{new Date(t.created_at).toLocaleDateString('id-ID')}</TableCell>
                <TableCell className="text-right">
                  {t.status === 'draft' && <>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setConfirmAction({ transfer: t, action: 'send' })}><Send className="w-3.5 h-3.5" /> Kirim</Button>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setConfirmAction({ transfer: t, action: 'cancel' })}><X className="w-3.5 h-3.5 text-destructive" /> Batal</Button>
                  </>}
                  {t.status === 'dikirim' && <>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setConfirmAction({ transfer: t, action: 'receive' })}><Check className="w-3.5 h-3.5 text-success" /> Terima</Button>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setConfirmAction({ transfer: t, action: 'cancel' })}><X className="w-3.5 h-3.5 text-destructive" /> Batal</Button>
                  </>}
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></ScrollArea>}
      </CardContent></Card>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Transfer Stok Antar Cabang</DialogTitle><DialogDescription>Stok akan dikurangi dari cabang asal saat dikirim, dan ditambah ke cabang tujuan saat diterima.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Dari Cabang *</Label>
                <Select value={form.from_branch_id} onValueChange={(v) => setForm({ ...form, from_branch_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih cabang asal" /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Ke Cabang *</Label>
                <Select value={form.to_branch_id} onValueChange={(v) => setForm({ ...form, to_branch_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih cabang tujuan" /></SelectTrigger>
                  <SelectContent>{branches.filter((b) => b.id !== form.from_branch_id).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Catatan</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            <div className="space-y-1.5">
              <Label>Item Produk</Label>
              <Select value="" onValueChange={addItem}>
                <SelectTrigger><SelectValue placeholder="Tambah produk..." /></SelectTrigger>
                <SelectContent>{products.filter((p) => !items.some((i) => i.product_id === p.id)).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {items.length > 0 && (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader><TableRow><TableHead>Produk</TableHead><TableHead className="w-32 text-right">Qty</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader>
                  <TableBody>{items.map((it) => {
                    const p = products.find((x) => x.id === it.product_id);
                    return (
                      <TableRow key={it.product_id}>
                        <TableCell className="text-sm font-medium">{p?.name || '-'}</TableCell>
                        <TableCell className="text-right"><Input type="number" min={0} value={it.quantity} onChange={(e) => updateItemQty(it.product_id, Number(e.target.value) || 0)} className="w-24 h-8 text-right" /></TableCell>
                        <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(it.product_id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                      </TableRow>
                    );
                  })}</TableBody>
                </Table>
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan Draft'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Action */}
      <AlertDialog open={!!confirmAction} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === 'send' ? 'Kirim transfer?' : confirmAction?.action === 'receive' ? 'Terima transfer?' : 'Batalkan transfer?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === 'send' ? 'Stok akan dikurangi dari cabang asal.' : confirmAction?.action === 'receive' ? 'Stok akan ditambah ke cabang tujuan.' : 'Transfer akan dibatalkan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={doAction} className={cn(buttonVariants({ variant: confirmAction?.action === 'cancel' ? 'destructive' : 'default' }))}>Konfirmasi</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
