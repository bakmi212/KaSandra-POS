import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, formatNumber, formatDate } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';
import { recordStockMovement, updateProductStock, MOVEMENT_TYPE_LABELS } from '@/lib/stock';
import type { Product, StockMovement } from '@/lib/types';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Warehouse, Loader2, AlertTriangle, ClipboardCheck, ArrowDownToLine, ArrowUpFromLine,
  Search, ChevronLeft, ChevronRight,
} from 'lucide-react';

const PAGE_SIZE = 10;

export default function StockPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // opname
  const [opnameOpen, setOpnameOpen] = useState(false);
  const [opnameProduct, setOpnameProduct] = useState('');
  const [opnamePhysical, setOpnamePhysical] = useState(0);
  const [opnameNote, setOpnameNote] = useState('');
  const [saving, setSaving] = useState(false);

  // adjustment
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjType, setAdjType] = useState<'tambah' | 'kurang'>('tambah');
  const [adjProduct, setAdjProduct] = useState('');
  const [adjQty, setAdjQty] = useState(0);
  const [adjReason, setAdjReason] = useState('Lainnya');
  const [adjNote, setAdjNote] = useState('');

  // mutasi filters
  const [mSearch, setMSearch] = useState('');
  const [mTypeFilter, mSetTypeFilter] = useState('all');
  const [mPage, setMPage] = useState(0);

  // stock search
  const [sSearch, setSSearch] = useState('');
  const [sPage, setSPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, m] = await Promise.all([
        supabase.from('products').select('*, category:categories(*)').order('name'),
        supabase.from('stock_movements').select('*, product:products(*)').order('created_at', { ascending: false }).limit(200),
      ]);
      if (p.error) throw p.error;
      setProducts((p.data as Product[]) || []);
      setMovements((m.data as StockMovement[]) || []);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // stock table
  const stockFiltered = useMemo(() => {
    const q = sSearch.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.sku || '').toLowerCase().includes(q));
  }, [products, sSearch]);

  const stockTotalPages = Math.max(1, Math.ceil(stockFiltered.length / PAGE_SIZE));
  const stockPage = Math.min(sPage, stockTotalPages - 1);
  const stockItems = stockFiltered.slice(stockPage * PAGE_SIZE, stockPage * PAGE_SIZE + PAGE_SIZE);

  const lowStock = products.filter((p) => Number(p.stock) <= (Number(p.minimum_stock) || Number(p.min_stock) || 0));
  const outStock = products.filter((p) => Number(p.stock) <= 0);

  // movements filtered
  const movFiltered = useMemo(() => {
    let list = movements;
    const q = mSearch.toLowerCase().trim();
    if (q) list = list.filter((m) => (m.product?.name || '').toLowerCase().includes(q));
    if (mTypeFilter !== 'all') list = list.filter((m) => m.type === mTypeFilter);
    return list;
  }, [movements, mSearch, mTypeFilter]);

  const movTotalPages = Math.max(1, Math.ceil(movFiltered.length / PAGE_SIZE));
  const movPage = Math.min(mPage, movTotalPages - 1);
  const movItems = movFiltered.slice(movPage * PAGE_SIZE, movPage * PAGE_SIZE + PAGE_SIZE);

  const getStockStatus = (p: Product) => {
    const stock = Number(p.stock);
    const min = Number(p.minimum_stock) || Number(p.min_stock) || 0;
    if (stock <= 0) return { label: 'Habis', variant: 'destructive' as const };
    if (stock <= min) return { label: 'Menipis', variant: 'secondary' as const };
    return { label: 'Aman', variant: 'outline' as const };
  };

  const openOpname = () => {
    setOpnameProduct('');
    setOpnamePhysical(0);
    setOpnameNote('');
    setOpnameOpen(true);
  };

  const saveOpname = async () => {
    if (!opnameProduct) { toast({ title: 'Pilih produk', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const prod = products.find((p) => p.id === opnameProduct);
      if (!prod) throw new Error('Produk tidak ditemukan');
      const systemStock = Number(prod.stock);
      const physicalStock = Number(opnamePhysical);
      const difference = physicalStock - systemStock;
      await supabase.from('stock_opnames').insert({
        product_id: opnameProduct,
        system_stock: systemStock,
        physical_stock: physicalStock,
        difference,
        notes: opnameNote,
        created_by: user?.id,
      });
      // update stock
      await supabase.from('products').update({ stock: physicalStock, updated_at: new Date().toISOString() }).eq('id', opnameProduct);
      await recordStockMovement({
        productId: opnameProduct,
        type: 'STOCK_OPNAME',
        qty: difference,
        reference: `opname-${Date.now()}`,
        note: `Stock opname: sistem ${systemStock} → fisik ${physicalStock}${opnameNote ? ` - ${opnameNote}` : ''}`,
        createdBy: user?.id,
      });
      toast({ title: 'Opname disimpan', description: `Selisih: ${difference >= 0 ? '+' : ''}${formatNumber(difference)}` });
      setOpnameOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openAdj = (type: 'tambah' | 'kurang') => {
    setAdjType(type);
    setAdjProduct('');
    setAdjQty(0);
    setAdjReason('Lainnya');
    setAdjNote('');
    setAdjOpen(true);
  };

  const saveAdj = async () => {
    if (!adjProduct || adjQty <= 0) { toast({ title: 'Lengkapi data', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const delta = adjType === 'tambah' ? adjQty : -adjQty;
      await supabase.from('stock_adjustments').insert({
        product_id: adjProduct,
        type: adjType,
        quantity: adjQty,
        reason: adjReason,
        created_by: user?.id,
      });
      await updateProductStock(adjProduct, delta);
      await recordStockMovement({
        productId: adjProduct,
        type: 'ADJUSTMENT',
        qty: delta,
        reference: `adj-${Date.now()}`,
        note: `Penyesuaian (${adjType === 'tambah' ? 'Tambah' : 'Kurang'}): ${adjReason}${adjNote ? ` - ${adjNote}` : ''}`,
        createdBy: user?.id,
      });
      toast({ title: 'Penyesuaian disimpan' });
      setAdjOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const opnameSystemStock = products.find((p) => p.id === opnameProduct)?.stock || 0;
  const opnameDiff = Number(opnamePhysical) - Number(opnameSystemStock);

  return (
    <div className="space-y-4">
      {/* Alert */}
      {(lowStock.length > 0 || outStock.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {outStock.length > 0 && (
            <Card className="border-destructive/50 bg-destructive/5 flex-1 min-w-[200px]">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <div>
                  <p className="font-medium text-sm">{outStock.length} Produk Habis</p>
                  <p className="text-xs text-muted-foreground">Segera lakukan pembelian</p>
                </div>
              </CardContent>
            </Card>
          )}
          {lowStock.length > 0 && (
            <Card className="border-warning/50 bg-warning/5 flex-1 min-w-[200px]">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-warning" />
                <div>
                  <p className="font-medium text-sm">{lowStock.length} Produk Menipis</p>
                  <p className="text-xs text-muted-foreground">Perlu restock segera</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={openOpname}><ClipboardCheck className="w-4 h-4" /> Stock Opname</Button>
        <Button variant="outline" onClick={() => openAdj('tambah')}><ArrowDownToLine className="w-4 h-4" /> Tambah Stok</Button>
        <Button variant="outline" onClick={() => openAdj('kurang')}><ArrowUpFromLine className="w-4 h-4" /> Kurangi Stok</Button>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stok Saat Ini</TabsTrigger>
          <TabsTrigger value="movements">Mutasi Stok</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Cari produk..." value={sSearch} onChange={(e) => { setSSearch(e.target.value); setSPage(0); }} className="pl-9" />
          </div>
          <Card className="border-border/50">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : error ? (
                <ErrorState message={error} onRetry={load} />
              ) : stockItems.length === 0 ? (
                <EmptyState icon={Warehouse} title="Tidak ada produk" />
              ) : (
                <>
                  <ScrollArea className="max-h-[60vh]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produk</TableHead>
                          <TableHead>Barcode</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">Stok</TableHead>
                          <TableHead className="text-right">Min. Stok</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stockItems.map((p) => {
                          const st = getStockStatus(p);
                          return (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{p.barcode || '-'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{p.sku || '-'}</TableCell>
                              <TableCell className="text-right font-medium">{formatNumber(Number(p.stock))} {p.unit}</TableCell>
                              <TableCell className="text-right text-sm">{formatNumber(Number(p.minimum_stock) || Number(p.min_stock) || 0)}</TableCell>
                              <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-xs text-muted-foreground">{stockPage * PAGE_SIZE + 1}-{Math.min((stockPage + 1) * PAGE_SIZE, stockFiltered.length)} dari {stockFiltered.length}</p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled={stockPage === 0} onClick={() => setSPage(stockPage - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                      <span className="text-sm px-2">{stockPage + 1} / {stockTotalPages}</span>
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled={stockPage >= stockTotalPages - 1} onClick={() => setSPage(stockPage + 1)}><ChevronRight className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Cari produk..." value={mSearch} onChange={(e) => { setMSearch(e.target.value); setMPage(0); }} className="pl-9" />
            </div>
            <Select value={mTypeFilter} onValueChange={(v) => { mSetTypeFilter(v); setMPage(0); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Jenis" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Jenis</SelectItem>
                {Object.entries(MOVEMENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card className="border-border/50">
            <CardContent className="p-0">
              {movItems.length === 0 ? (
                <EmptyState icon={Warehouse} title="Belum ada mutasi stok" />
              ) : (
                <>
                  <ScrollArea className="max-h-[60vh]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Produk</TableHead>
                          <TableHead>Jenis</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Saldo Sebelum</TableHead>
                          <TableHead className="text-right">Saldo Sesudah</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movItems.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="text-sm text-muted-foreground">{formatDate(m.created_at)}</TableCell>
                            <TableCell className="font-medium text-sm">{m.product?.name || '-'}</TableCell>
                            <TableCell><Badge variant="outline">{MOVEMENT_TYPE_LABELS[m.type] || m.type}</Badge></TableCell>
                            <TableCell className={`text-right font-medium ${Number(m.qty) >= 0 ? 'text-success' : 'text-destructive'}`}>{Number(m.qty) >= 0 ? '+' : ''}{formatNumber(Number(m.qty))}</TableCell>
                            <TableCell className="text-right text-sm">{formatNumber(Number(m.balance_before || 0))}</TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatNumber(Number(m.balance_after || 0))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-xs text-muted-foreground">{movPage * PAGE_SIZE + 1}-{Math.min((movPage + 1) * PAGE_SIZE, movFiltered.length)} dari {movFiltered.length}</p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled={movPage === 0} onClick={() => setMPage(movPage - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                      <span className="text-sm px-2">{movPage + 1} / {movTotalPages}</span>
                      <Button variant="outline" size="icon" className="h-8 w-8" disabled={movPage >= movTotalPages - 1} onClick={() => setMPage(movPage + 1)}><ChevronRight className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Opname Dialog */}
      <Dialog open={opnameOpen} onOpenChange={setOpnameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stock Opname</DialogTitle>
            <DialogDescription>Bandingkan stok sistem dengan stok fisik</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Produk *</Label>
              <Select value={opnameProduct} onValueChange={setOpnameProduct}>
                <SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (Stok: {formatNumber(Number(p.stock))})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {opnameProduct && (
              <div className="grid grid-cols-3 gap-2 p-3 rounded-lg bg-muted/50 text-sm">
                <div><p className="text-xs text-muted-foreground">Sistem</p><p className="font-bold">{formatNumber(Number(opnameSystemStock))}</p></div>
                <div><p className="text-xs text-muted-foreground">Fisik</p><p className="font-bold">{formatNumber(Number(opnamePhysical))}</p></div>
                <div><p className="text-xs text-muted-foreground">Selisih</p><p className={`font-bold ${opnameDiff >= 0 ? 'text-success' : 'text-destructive'}`}>{opnameDiff >= 0 ? '+' : ''}{formatNumber(opnameDiff)}</p></div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Stok Fisik *</Label>
              <Input type="number" min={0} value={opnamePhysical || ''} onChange={(e) => setOpnamePhysical(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Textarea value={opnameNote} onChange={(e) => setOpnameNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpnameOpen(false)}>Batal</Button>
            <Button onClick={saveOpname} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan Opname'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjustment Dialog */}
      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Penyesuaian Stok - {adjType === 'tambah' ? 'Tambah' : 'Kurang'}</DialogTitle>
            <DialogDescription>Semua perubahan tercatat di mutasi stok</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Produk *</Label>
              <Select value={adjProduct} onValueChange={setAdjProduct}>
                <SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (Stok: {formatNumber(Number(p.stock))})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Qty *</Label>
              <Input type="number" min={1} value={adjQty || ''} onChange={(e) => setAdjQty(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Alasan *</Label>
              <Select value={adjReason} onValueChange={setAdjReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Barang Rusak">Barang Rusak</SelectItem>
                  <SelectItem value="Hilang">Hilang</SelectItem>
                  <SelectItem value="Koreksi">Koreksi</SelectItem>
                  <SelectItem value="Salah Input">Salah Input</SelectItem>
                  <SelectItem value="Lainnya">Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Textarea value={adjNote} onChange={(e) => setAdjNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjOpen(false)}>Batal</Button>
            <Button onClick={saveAdj} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
