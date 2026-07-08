import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, formatRupiah, formatNumber, formatDate, formatDateShort } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';
import { generatePurchaseNumber, PURCHASE_STATUS_LABELS } from '@/lib/stock';
import type { Purchase, Supplier, Product } from '@/lib/types';
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
import {
  Plus, Search, Pencil, Trash2, Eye, Loader2, ChevronLeft, ChevronRight, Printer, Download,
  ShoppingCart, X, FileText,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const schema = z.object({
  supplier_id: z.string().optional(),
  purchase_date: z.string().min(1, 'Tanggal wajib diisi'),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const PAGE_SIZE = 10;

interface FormItem {
  product_id: string;
  quantity: number;
  purchase_price: number;
  discount: number;
  subtotal: number;
}

export default function PurchasesPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [items, setItems] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Purchase | null>(null);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formItems, setFormItems] = useState<FormItem[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { supplier_id: '', purchase_date: new Date().toISOString().slice(0, 10), notes: '' },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, s, prod] = await Promise.all([
        supabase.from('purchases').select('*, supplier:suppliers(*), purchase_items(*, product:products(*))').order('created_at', { ascending: false }),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('products').select('*').order('name'),
      ]);
      if (p.error) throw p.error;
      setItems((p.data as Purchase[]) || []);
      setSuppliers((s.data as Supplier[]) || []);
      setProducts((prod.data as Product[]) || []);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = items;
    const q = search.toLowerCase().trim();
    if (q) list = list.filter((p) => (p.purchase_number || p.invoice_no || '').toLowerCase().includes(q));
    if (statusFilter !== 'all') list = list.filter((p) => p.status === statusFilter);
    if (supplierFilter !== 'all') list = list.filter((p) => p.supplier_id === supplierFilter);
    return list;
  }, [items, search, statusFilter, supplierFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const openNew = () => {
    setEditing(null);
    setFormItems([]);
    form.reset({ supplier_id: '', purchase_date: new Date().toISOString().slice(0, 10), notes: '' });
    setOpen(true);
  };

  const openEdit = (p: Purchase) => {
    if (p.status !== 'draft') {
      toast({ title: 'Hanya draft yang dapat diedit', variant: 'destructive' });
      return;
    }
    setEditing(p);
    form.reset({
      supplier_id: p.supplier_id || '',
      purchase_date: p.purchase_date || new Date(p.created_at).toISOString().slice(0, 10),
      notes: p.notes || p.note || '',
    });
    setFormItems((p.purchase_items || []).map((it: any) => ({
      product_id: it.product_id || '',
      quantity: Number(it.quantity),
      purchase_price: Number(it.purchase_price),
      discount: Number(it.discount),
      subtotal: Number(it.subtotal),
    })));
    setOpen(true);
  };

  const addFormItem = () => {
    setFormItems([...formItems, { product_id: '', quantity: 1, purchase_price: 0, discount: 0, subtotal: 0 }]);
  };

  const updateFormItem = (idx: number, field: keyof FormItem, value: any) => {
    setFormItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      if (field === 'product_id') {
        const prod = products.find((p) => p.id === value);
        if (prod) updated.purchase_price = Number(prod.purchase_price) || Number(prod.cost_price) || 0;
      }
      if (['quantity', 'purchase_price', 'discount'].includes(field)) {
        const base = Number(updated.quantity) * Number(updated.purchase_price);
        updated.subtotal = Math.max(0, base - Number(updated.discount));
      }
      return updated;
    }));
  };

  const removeFormItem = (idx: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalItems = formItems.length;
  const totalPurchase = formItems.reduce((s, i) => s + i.subtotal, 0);

  const onSubmit = async (values: FormValues) => {
    if (formItems.length === 0) {
      toast({ title: 'Tambahkan minimal 1 item', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const purchaseNumber = editing?.purchase_number || editing?.invoice_no || generatePurchaseNumber();
      const payload = {
        purchase_number: purchaseNumber,
        invoice_no: purchaseNumber,
        supplier_id: values.supplier_id || null,
        purchase_date: values.purchase_date,
        status: 'draft',
        total: totalPurchase,
        paid: 0,
        note: values.notes || '',
        notes: values.notes || '',
        created_by: user?.id,
      };
      let purchaseId = editing?.id;
      if (editing) {
        const { error } = await supabase.from('purchases').update(payload).eq('id', editing.id);
        if (error) throw error;
        await supabase.from('purchase_items').delete().eq('purchase_id', editing.id);
      } else {
        const { data, error } = await supabase.from('purchases').insert(payload).select('*').maybeSingle();
        if (error) throw error;
        purchaseId = data.id;
      }
      const itemsPayload = formItems.map((it) => ({
        purchase_id: purchaseId,
        product_id: it.product_id || null,
        quantity: it.quantity,
        received_quantity: 0,
        purchase_price: it.purchase_price,
        discount: it.discount,
        subtotal: it.subtotal,
      }));
      const { error: itemsErr } = await supabase.from('purchase_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;
      toast({ title: editing ? 'Pembelian diperbarui' : 'Pembelian dibuat' });
      setOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('purchases').delete().eq('id', deleteId);
    if (error) toast({ title: 'Gagal menghapus', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Pembelian dihapus' }); load(); }
    setDeleteId(null);
  };

  const statusVariant = (status: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    if (status === 'selesai' || status === 'lunas') return 'default';
    if (status === 'dibatalkan') return 'destructive';
    if (status === 'diterima_sebagian') return 'secondary';
    return 'outline';
  };

  const printPurchase = (p: Purchase) => {
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return;
    const rows = (p.purchase_items || []).map((it: any) => `
      <tr>
        <td>${it.product?.name || '-'}</td>
        <td style="text-align:center;">${it.quantity}</td>
        <td style="text-align:right;">${Number(it.purchase_price).toLocaleString('id-ID')}</td>
        <td style="text-align:right;">${Number(it.discount).toLocaleString('id-ID')}</td>
        <td style="text-align:right;">${Number(it.subtotal).toLocaleString('id-ID')}</td>
      </tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>${p.purchase_number || p.invoice_no}</title>
    <style>body{font-family:Arial;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:6px;font-size:12px;}th{background:#f5f5f5;}.total{font-size:14px;font-weight:bold;margin-top:10px;text-align:right;}</style>
    </head><body>
      <h2>KaSandra - Pembelian</h2>
      <p>No: ${p.purchase_number || p.invoice_no}<br/>Supplier: ${p.supplier?.name || '-'}<br/>Tanggal: ${formatDate(p.purchase_date || p.created_at)}<br/>Status: ${PURCHASE_STATUS_LABELS[p.status] || p.status}</p>
      <table><thead><tr><th>Produk</th><th>Qty</th><th>Harga Beli</th><th>Diskon</th><th>Subtotal</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="total">Total: Rp ${Number(p.total).toLocaleString('id-ID')}</p>
      ${p.notes || p.note ? `<p>Catatan: ${p.notes || p.note}</p>` : ''}
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const exportPDF = (p: Purchase) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('KaSandra - Pembelian', 14, 18);
    doc.setFontSize(10);
    doc.text(`No: ${p.purchase_number || p.invoice_no}`, 14, 25);
    doc.text(`Supplier: ${p.supplier?.name || '-'}`, 14, 31);
    doc.text(`Tanggal: ${formatDateShort(p.purchase_date || p.created_at)}`, 14, 37);
    doc.text(`Status: ${PURCHASE_STATUS_LABELS[p.status] || p.status}`, 14, 43);
    autoTable(doc, {
      startY: 50,
      head: [['Produk', 'Qty', 'Harga Beli', 'Diskon', 'Subtotal']],
      body: (p.purchase_items || []).map((it: any) => [
        it.product?.name || '-',
        it.quantity,
        Number(it.purchase_price).toLocaleString('id-ID'),
        Number(it.discount).toLocaleString('id-ID'),
        Number(it.subtotal).toLocaleString('id-ID'),
      ]),
      foot: [['', '', '', 'Total', `Rp ${Number(p.total).toLocaleString('id-ID')}`]],
    });
    doc.save(`pembelian-${p.purchase_number || p.invoice_no}.pdf`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-1 gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Cari nomor pembelian..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="dipesan">Dipesan</SelectItem>
              <SelectItem value="diterima_sebagian">Diterima Sebagian</SelectItem>
              <SelectItem value="selesai">Selesai</SelectItem>
              <SelectItem value="dibatalkan">Dibatalkan</SelectItem>
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={(v) => { setSupplierFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Supplier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Supplier</SelectItem>
              {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4" /> Tambah Pembelian</Button>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : pageItems.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Belum ada pembelian" description="Buat pembelian baru dari supplier"
              action={<Button onClick={openNew} size="sm"><Plus className="w-4 h-4" /> Tambah Pembelian</Button>} />
          ) : (
            <>
              <ScrollArea className="max-h-[62vh]">
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
                    {pageItems.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium text-sm">{p.purchase_number || p.invoice_no}</TableCell>
                        <TableCell className="text-sm">{p.supplier?.name || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDateShort(p.purchase_date || p.created_at)}</TableCell>
                        <TableCell className="text-right font-medium">{formatRupiah(Number(p.total))}</TableCell>
                        <TableCell><Badge variant={statusVariant(p.status)}>{PURCHASE_STATUS_LABELS[p.status] || p.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetail(p)}><Eye className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => printPurchase(p)}><Printer className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => exportPDF(p)}><Download className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} disabled={p.status !== 'draft'}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(p.id)} disabled={p.status !== 'draft'}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">
                  {currentPage * PAGE_SIZE + 1}-{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} dari {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                  <span className="text-sm px-2">{currentPage + 1} / {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Draft Pembelian' : 'Tambah Pembelian'}</DialogTitle>
            <DialogDescription>Status awal: Draft. Penerimaan barang dilakukan di halaman Penerimaan.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={form.watch('supplier_id') || 'none'} onValueChange={(v) => form.setValue('supplier_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih supplier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa supplier</SelectItem>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tanggal *</Label>
                <Input type="date" {...form.register('purchase_date')} />
                {form.formState.errors.purchase_date && <p className="text-xs text-destructive">{form.formState.errors.purchase_date.message}</p>}
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Detail Item</Label>
                <Button type="button" variant="outline" size="sm" onClick={addFormItem}><Plus className="w-4 h-4" /> Tambah Item</Button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
                {formItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Belum ada item. Klik "Tambah Item".</p>
                ) : formItems.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 rounded-lg border">
                    <div className="col-span-4 space-y-1">
                      <Label className="text-xs">Produk</Label>
                      <Select value={it.product_id} onValueChange={(v) => updateFormItem(idx, 'product_id', v)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Pilih" /></SelectTrigger>
                        <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min={0} value={it.quantity || ''} onChange={(e) => updateFormItem(idx, 'quantity', Number(e.target.value) || 0)} className="h-8" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Harga Beli</Label>
                      <Input type="number" min={0} value={it.purchase_price || ''} onChange={(e) => updateFormItem(idx, 'purchase_price', Number(e.target.value) || 0)} className="h-8" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Diskon</Label>
                      <Input type="number" min={0} value={it.discount || ''} onChange={(e) => updateFormItem(idx, 'discount', Number(e.target.value) || 0)} className="h-8" />
                    </div>
                    <div className="col-span-1 space-y-1">
                      <Label className="text-xs">Subtotal</Label>
                      <p className="text-sm font-medium h-8 flex items-center">{formatRupiah(it.subtotal)}</p>
                    </div>
                    <div className="col-span-1">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeFormItem(idx)}><X className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between p-3 rounded-lg bg-muted/50">
                <div className="text-sm"><span className="text-muted-foreground">Total Item: </span><span className="font-medium">{totalItems}</span></div>
                <div className="text-sm"><span className="text-muted-foreground">Total Pembelian: </span><span className="font-bold text-base">{formatRupiah(totalPurchase)}</span></div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Textarea {...form.register('notes')} rows={2} />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan Draft'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="w-5 h-5" /> Detail Pembelian</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Nomor: </span><span className="font-medium">{detail.purchase_number || detail.invoice_no}</span></div>
                <div><span className="text-muted-foreground">Supplier: </span><span className="font-medium">{detail.supplier?.name || '-'}</span></div>
                <div><span className="text-muted-foreground">Tanggal: </span><span className="font-medium">{formatDate(detail.purchase_date || detail.created_at)}</span></div>
                <div><span className="text-muted-foreground">Status: </span><Badge variant={statusVariant(detail.status)}>{PURCHASE_STATUS_LABELS[detail.status] || detail.status}</Badge></div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Diterima</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                    <TableHead className="text-right">Diskon</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(detail.purchase_items || []).map((it: any) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-sm">{it.product?.name || '-'}</TableCell>
                      <TableCell className="text-right">{formatNumber(Number(it.quantity))}</TableCell>
                      <TableCell className="text-right">{formatNumber(Number(it.received_quantity))}</TableCell>
                      <TableCell className="text-right">{formatRupiah(Number(it.purchase_price))}</TableCell>
                      <TableCell className="text-right">{formatRupiah(Number(it.discount))}</TableCell>
                      <TableCell className="text-right font-medium">{formatRupiah(Number(it.subtotal))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between p-3 rounded-lg bg-muted/50">
                <span className="font-medium">Total Pembelian</span>
                <span className="font-bold text-lg">{formatRupiah(Number(detail.total))}</span>
              </div>
              {(detail.notes || detail.note) && <p className="text-sm"><span className="text-muted-foreground">Catatan: </span>{detail.notes || detail.note}</p>}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => printPurchase(detail)}><Printer className="w-4 h-4" /> Print</Button>
                <Button variant="outline" size="sm" onClick={() => exportPDF(detail)}><Download className="w-4 h-4" /> PDF</Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Draft Pembelian?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className={cn(buttonVariants({ variant: 'destructive' }))}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
