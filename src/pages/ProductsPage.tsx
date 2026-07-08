import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase, formatRupiah, formatNumber } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import type { Product, Category } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
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
import { ErrorState, EmptyState } from '@/components/states';
import {
  Plus, Search, Pencil, Trash2, Package, Loader2, Upload, X, Eye, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, AlertCircle, Download, FileSpreadsheet, FileDown, CheckCircle2,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import * as XLSX from 'xlsx';

const productSchema = z.object({
  name: z.string().min(1, 'Nama produk wajib diisi'),
  barcode: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  category_id: z.string().optional().nullable(),
  purchase_price: z.coerce.number().min(0, 'Harga beli tidak boleh negatif'),
  selling_price: z.coerce.number().min(0, 'Harga jual tidak boleh negatif'),
  stock: z.coerce.number().min(0, 'Stok tidak boleh negatif'),
  minimum_stock: z.coerce.number().min(0, 'Minimal stok tidak boleh negatif'),
  unit: z.string().min(1, 'Satuan wajib diisi'),
  is_active: z.boolean(),
});
type ProductForm = z.infer<typeof productSchema>;

type SortKey = 'name' | 'barcode' | 'sku' | 'selling_price' | 'stock' | 'created_at';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

export default function ProductsPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [open, setOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>('');

  // Excel import state
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<'select' | 'preview' | 'importing' | 'summary'>('select');
  const [importData, setImportData] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSummary, setImportSummary] = useState<{ success: number; failed: number; errors: string[] }>({ success: 0, failed: 0, errors: [] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '', barcode: '', sku: '', category_id: '',
      purchase_price: 0, selling_price: 0, stock: 0, minimum_stock: 0,
      unit: 'pcs', is_active: true,
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, c] = await Promise.all([
        supabase.from('products').select('*, category:categories(*)').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('name'),
      ]);
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      setProducts((p.data as Product[]) || []);
      setCategories((c.data as Category[]) || []);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // filter + sort + paginate (client-side; data set is small for master data)
  const filtered = useMemo(() => {
    let list = products;
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== 'all') {
      list = list.filter((p) => p.category_id === categoryFilter);
    }
    if (statusFilter !== 'all') {
      const active = statusFilter === 'active';
      list = list.filter((p) => p.is_active === active);
    }
    list = [...list].sort((a, b) => {
      let av: any = a[sortKey];
      let bv: any = b[sortKey];
      if (av == null) av = '';
      if (bv == null) bv = '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [products, search, categoryFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const openNew = () => {
    setEditing(null);
    setImageUrl('');
    form.reset({
      name: '', barcode: '', sku: '', category_id: '',
      purchase_price: 0, selling_price: 0, stock: 0, minimum_stock: 0,
      unit: 'pcs', is_active: true,
    });
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setImageUrl(p.image_url || p.photo_url || '');
    form.reset({
      name: p.name,
      barcode: p.barcode || '',
      sku: p.sku || '',
      category_id: p.category_id || '',
      purchase_price: Number(p.purchase_price) || Number(p.cost_price) || 0,
      selling_price: Number(p.selling_price) || Number(p.sell_price) || 0,
      stock: Number(p.stock) || 0,
      minimum_stock: Number(p.minimum_stock) || Number(p.min_stock) || 0,
      unit: p.unit || 'pcs',
      is_active: p.is_active,
    });
    setOpen(true);
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const name = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('products').upload(name, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('products').getPublicUrl(name);
      setImageUrl(data.publicUrl);
      toast({ title: 'Foto diunggah' });
    } catch (e: any) {
      toast({ title: 'Gagal unggah', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (values: ProductForm) => {
    setSaving(true);
    try {
      const payload = {
        name: values.name,
        barcode: values.barcode || null,
        sku: values.sku || null,
        category_id: values.category_id || null,
        purchase_price: values.purchase_price,
        selling_price: values.selling_price,
        cost_price: values.purchase_price,
        sell_price: values.selling_price,
        stock: values.stock,
        minimum_stock: values.minimum_stock,
        min_stock: values.minimum_stock,
        unit: values.unit,
        image_url: imageUrl || null,
        photo_url: imageUrl || null,
        is_active: values.is_active,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from('products').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Produk diperbarui' });
      } else {
        const { error } = await supabase.from('products').insert(payload);
        if (error) throw error;
        toast({ title: 'Produk ditambahkan' });
      }
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
    const { error } = await supabase.from('products').delete().eq('id', deleteId);
    if (error) {
      toast({ title: 'Gagal menghapus', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Produk dihapus' });
      load();
    }
    setDeleteId(null);
  };

  // ===== Excel Export =====
  const exportExcel = () => {
    const rows = filtered.map((p) => ({
      Barcode: p.barcode || '',
      SKU: p.sku || '',
      'Nama Produk': p.name,
      Kategori: categories.find((c) => c.id === p.category_id)?.name || '',
      'Harga Beli': p.cost_price,
      'Harga Jual': p.sell_price,
      Stok: p.stock,
      'Minimal Stok': p.min_stock || 0,
      Satuan: p.unit || 'pcs',
      Status: p.is_active ? 'Aktif' : 'Nonaktif',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produk');
    XLSX.writeFile(wb, `produk-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: 'Export berhasil', description: `${rows.length} produk diekspor` });
  };

  // ===== Excel Template Download =====
  const downloadTemplate = () => {
    const sample = [{
      Barcode: '8990001234567',
      SKU: 'PROD-001',
      'Nama Produk': 'Kopi Hitam 250gr',
      Kategori: 'Minuman',
      'Harga Beli': 15000,
      'Harga Jual': 25000,
      Stok: 100,
      'Minimal Stok': 10,
      Satuan: 'pcs',
      Status: 'Aktif',
    }];
    const ws = XLSX.utils.json_to_sheet(sample);
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'template-import-produk.xlsx');
    toast({ title: 'Template didownload' });
  };

  // ===== Excel Import =====
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<any>(ws);
        validateImportData(json);
      } catch (err: any) {
        toast({ title: 'Gagal membaca file', description: err.message, variant: 'destructive' });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const validateImportData = (rows: any[]) => {
    const errors: string[] = [];
    const validRows: any[] = [];
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    const existingSkus = new Set(products.map((p) => p.sku).filter(Boolean));
    const existingBarcodes = new Set(products.map((p) => p.barcode).filter(Boolean));
    const categoryNames = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const name = row['Nama Produk']?.toString().trim();
      const sku = row['SKU']?.toString().trim() || '';
      const barcode = row['Barcode']?.toString().trim() || '';
      const categoryName = row['Kategori']?.toString().trim() || '';
      const costPrice = Number(row['Harga Beli']) || 0;
      const sellPrice = Number(row['Harga Jual']) || 0;
      const stock = Number(row['Stok']) || 0;
      const minStock = Number(row['Minimal Stok']) || 0;
      const unit = row['Satuan']?.toString().trim() || 'pcs';
      const status = row['Status']?.toString().trim().toLowerCase() || 'aktif';

      if (!name) { errors.push(`Baris ${rowNum}: Nama Produk kosong`); return; }
      if (!sellPrice || sellPrice <= 0) { errors.push(`Baris ${rowNum}: Harga Jual kosong atau 0`); return; }
      if (!barcode) { errors.push(`Baris ${rowNum}: Barcode kosong`); }
      if (sku && seenSkus.has(sku)) { errors.push(`Baris ${rowNum}: SKU duplikat dalam file (${sku})`); return; }
      if (sku && existingSkus.has(sku)) { errors.push(`Baris ${rowNum}: SKU sudah ada di database (${sku})`); return; }
      if (barcode && seenBarcodes.has(barcode)) { errors.push(`Baris ${rowNum}: Barcode duplikat dalam file (${barcode})`); return; }
      if (barcode && existingBarcodes.has(barcode)) { errors.push(`Baris ${rowNum}: Barcode sudah ada di database (${barcode})`); return; }
      if (categoryName && !categoryNames.has(categoryName.toLowerCase())) {
        errors.push(`Baris ${rowNum}: Kategori tidak ditemukan (${categoryName})`);
      }

      if (sku) seenSkus.add(sku);
      if (barcode) seenBarcodes.add(barcode);

      validRows.push({
        barcode,
        sku,
        name,
        category_id: categoryNames.get(categoryName.toLowerCase()) || null,
        cost_price: costPrice,
        sell_price: sellPrice,
        stock,
        min_stock: minStock,
        unit,
        is_active: status === 'aktif',
      });
    });

    setImportData(validRows);
    setImportErrors(errors);
    setImportStep('preview');
  };

  const executeImport = async () => {
    setImportStep('importing');
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of importData) {
      const { error } = await supabase.from('products').insert(row);
      if (error) {
        failed++;
        errors.push(`${row.name}: ${error.message}`);
      } else {
        success++;
      }
    }

    setImportSummary({ success, failed, errors });
    setImportStep('summary');
    load();
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(k)}>
      {label}
      {sortKey === k ? (
        sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-1 gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama, barcode, SKU..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Kategori" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="inactive">Nonaktif</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate}><FileDown className="w-4 h-4" /> Template</Button>
          <Button variant="outline" onClick={exportExcel}><Download className="w-4 h-4" /> Export</Button>
          <Button variant="outline" onClick={() => { setImportStep('select'); setImportData([]); setImportErrors([]); setImportOpen(true); }}><Upload className="w-4 h-4" /> Import</Button>
          <Button onClick={openNew}><Plus className="w-4 h-4" /> Tambah Produk</Button>
        </div>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : pageItems.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Belum ada produk"
              description="Tambahkan produk pertama untuk mulai menjual"
              action={<Button onClick={openNew} size="sm"><Plus className="w-4 h-4" /> Tambah Produk</Button>}
            />
          ) : (
            <>
              <ScrollArea className="max-h-[62vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><SortHeader label="Produk" k="name" /></TableHead>
                      <TableHead><SortHeader label="Barcode" k="barcode" /></TableHead>
                      <TableHead><SortHeader label="SKU" k="sku" /></TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right"><SortHeader label="Harga Jual" k="selling_price" /></TableHead>
                      <TableHead className="text-right"><SortHeader label="Stok" k="stock" /></TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                              {(p.image_url || p.photo_url) ? (
                                <img src={p.image_url || p.photo_url!} alt={p.name} className="w-full h-full object-cover" />
                              ) : (
                                <Package className="w-5 h-5 text-muted-foreground" />
                              )}
                            </div>
                            <span className="font-medium">{p.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.barcode || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.sku || '-'}</TableCell>
                        <TableCell>
                          {p.category ? (
                            <Badge variant="outline" style={p.category.color ? { borderColor: p.category.color, color: p.category.color } : undefined}>
                              {p.category.name}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatRupiah(Number(p.selling_price) || Number(p.sell_price) || 0)}</TableCell>
                        <TableCell className="text-right">
                          <span className={Number(p.stock) <= Number(p.minimum_stock || p.min_stock) ? 'text-warning font-medium' : ''}>
                            {formatNumber(Number(p.stock))} {p.unit}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.is_active ? 'default' : 'secondary'}>
                            {p.is_active ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetailItem(p)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(p.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Menampilkan {currentPage * PAGE_SIZE + 1}-{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} dari {filtered.length} produk
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm px-2">{currentPage + 1} / {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages - 1} onClick={() => setPage(currentPage + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Produk' : 'Tambah Produk'}</DialogTitle>
            <DialogDescription>Lengkapi data produk</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Image */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {imageUrl ? (
                  <img src={imageUrl} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <Label className="text-sm">Foto Produk</Label>
                <div className="flex gap-2 mt-1">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
                    />
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm hover:bg-accent cursor-pointer">
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Unggah
                    </span>
                  </label>
                  {imageUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setImageUrl('')}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Nama Produk *</Label>
                <Input {...form.register('name')} />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Barcode</Label>
                <Input {...form.register('barcode')} placeholder="8990001..." />
              </div>
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input {...form.register('sku')} placeholder="SKU-001" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Kategori</Label>
                <Select value={form.watch('category_id') || 'none'} onValueChange={(v) => form.setValue('category_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa kategori</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Harga Beli</Label>
                <Input type="number" {...form.register('purchase_price')} />
                {form.formState.errors.purchase_price && (
                  <p className="text-xs text-destructive">{form.formState.errors.purchase_price.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Harga Jual</Label>
                <Input type="number" {...form.register('selling_price')} />
                {form.formState.errors.selling_price && (
                  <p className="text-xs text-destructive">{form.formState.errors.selling_price.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Stok Awal</Label>
                <Input type="number" {...form.register('stock')} />
                {form.formState.errors.stock && (
                  <p className="text-xs text-destructive">{form.formState.errors.stock.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Minimal Stok</Label>
                <Input type="number" {...form.register('minimum_stock')} />
                {form.formState.errors.minimum_stock && (
                  <p className="text-xs text-destructive">{form.formState.errors.minimum_stock.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Satuan</Label>
                <Input {...form.register('unit')} />
                {form.formState.errors.unit && (
                  <p className="text-xs text-destructive">{form.formState.errors.unit.message}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <Label>Status Aktif</Label>
              <Switch checked={form.watch('is_active')} onCheckedChange={(v) => form.setValue('is_active', v)} />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={form.handleSubmit(onSubmit)} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!detailItem} onOpenChange={(v) => !v && setDetailItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Detail Produk</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
                  {(detailItem.image_url || detailItem.photo_url) ? (
                    <img src={detailItem.image_url || detailItem.photo_url!} alt={detailItem.name} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{detailItem.name}</h3>
                  <Badge variant={detailItem.is_active ? 'default' : 'secondary'}>{detailItem.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Barcode:</span> <span className="font-medium">{detailItem.barcode || '-'}</span></div>
                <div><span className="text-muted-foreground">SKU:</span> <span className="font-medium">{detailItem.sku || '-'}</span></div>
                <div><span className="text-muted-foreground">Kategori:</span> <span className="font-medium">{detailItem.category?.name || '-'}</span></div>
                <div><span className="text-muted-foreground">Satuan:</span> <span className="font-medium">{detailItem.unit}</span></div>
                <div><span className="text-muted-foreground">Harga Beli:</span> <span className="font-medium">{formatRupiah(Number(detailItem.purchase_price) || Number(detailItem.cost_price) || 0)}</span></div>
                <div><span className="text-muted-foreground">Harga Jual:</span> <span className="font-medium">{formatRupiah(Number(detailItem.selling_price) || Number(detailItem.sell_price) || 0)}</span></div>
                <div><span className="text-muted-foreground">Stok:</span> <span className="font-medium">{formatNumber(Number(detailItem.stock))} {detailItem.unit}</span></div>
                <div><span className="text-muted-foreground">Min. Stok:</span> <span className="font-medium">{formatNumber(Number(detailItem.minimum_stock) || Number(detailItem.min_stock) || 0)}</span></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailItem(null)}>Tutup</Button>
            <Button onClick={() => { if (detailItem) { openEdit(detailItem); setDetailItem(null); } }}>
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Produk?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini tidak dapat dibatalkan. Produk akan dihapus permanen dari database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className={cn(buttonVariants({ variant: 'destructive' }))}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Excel Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> Import Produk dari Excel</DialogTitle>
            <DialogDescription>
              {importStep === 'select' && 'Pilih file Excel untuk diimpor'}
              {importStep === 'preview' && 'Periksa data sebelum diimpor'}
              {importStep === 'importing' && 'Sedang mengimpor...'}
              {importStep === 'summary' && 'Import selesai'}
            </DialogDescription>
          </DialogHeader>

          {importStep === 'select' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-3">Klik untuk memilih file Excel (.xlsx, .xls)</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                <Button variant="outline" onClick={() => fileInputRef?.current?.click()}>
                  <Upload className="w-4 h-4" /> Pilih File
                </Button>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Format kolom yang diharapkan:</p>
                <p>Barcode, SKU, Nama Produk, Kategori, Harga Beli, Harga Jual, Stok, Minimal Stok, Satuan, Status</p>
                <p>Belum punya template? <button onClick={downloadTemplate} className="text-primary underline">Download template</button></p>
              </div>
            </div>
          )}

          {importStep === 'preview' && (
            <div className="space-y-4">
              {importErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                    <AlertCircle className="w-4 h-4" /> {importErrors.length} error ditemukan
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {importErrors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive">{err}</p>
                    ))}
                  </div>
                </div>
              )}
              {importData.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{importData.length} produk siap diimpor</p>
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2">Nama</th>
                          <th className="text-left p-2">SKU</th>
                          <th className="text-right p-2">Harga Jual</th>
                          <th className="text-right p-2">Stok</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importData.slice(0, 50).map((row, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{row.name}</td>
                            <td className="p-2">{row.sku || '-'}</td>
                            <td className="p-2 text-right">{Number(row.sell_price).toLocaleString('id-ID')}</td>
                            <td className="p-2 text-right">{row.stock}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => { setImportStep('select'); setImportData([]); setImportErrors([]); }}>Kembali</Button>
                <Button onClick={executeImport} disabled={importData.length === 0}>
                  <Upload className="w-4 h-4" /> Import {importData.length} Produk
                </Button>
              </div>
            </div>
          )}

          {importStep === 'importing' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Sedang mengimpor produk...</p>
            </div>
          )}

          {importStep === 'summary' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-4 gap-2">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${importSummary.failed === 0 ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                  {importSummary.failed === 0 ? <CheckCircle2 className="w-7 h-7 text-emerald-500" /> : <AlertCircle className="w-7 h-7 text-amber-500" />}
                </div>
                <p className="text-lg font-semibold">Import Selesai</p>
                <p className="text-sm text-muted-foreground">{importSummary.success} berhasil, {importSummary.failed} gagal</p>
              </div>
              {importSummary.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-1">
                  <p className="text-sm font-medium text-destructive">Error:</p>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {importSummary.errors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive">{err}</p>
                    ))}
                  </div>
                </div>
              )}
              <Button className="w-full" onClick={() => setImportOpen(false)}>Selesai</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
