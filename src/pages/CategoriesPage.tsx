import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import type { Category } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ErrorState, EmptyState } from '@/components/states';
import {
  Plus, Search, Pencil, Trash2, Tags, Loader2, ChevronLeft, ChevronRight, AlertCircle, Package,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const schema = z.object({
  name: z.string().min(1, 'Nama kategori wajib diisi'),
  description: z.string().optional(),
  color: z.string().min(1, 'Warna wajib diisi'),
});
type FormValues = z.infer<typeof schema>;

const PAGE_SIZE = 8;
const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

export default function CategoriesPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', color: PRESET_COLORS[0] },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      const cats = (data as Category[]) || [];
      // count products per category
      const { data: counts } = await supabase.from('products').select('category_id');
      const countMap: Record<string, number> = {};
      (counts || []).forEach((p: any) => {
        if (p.category_id) countMap[p.category_id] = (countMap[p.category_id] || 0) + 1;
      });
      setItems(cats.map((c) => ({ ...c, product_count: countMap[c.id] || 0 })));
    } catch (e: any) {
      setError(e.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((c) => c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const openNew = () => {
    setEditing(null);
    form.reset({ name: '', description: '', color: PRESET_COLORS[0] });
    setOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    form.reset({ name: c.name, description: c.description || '', color: c.color || PRESET_COLORS[0] });
    setOpen(true);
  };

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      // unique name check
      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', values.name)
        .maybeSingle();
      if (existing && existing.id !== editing?.id) {
        form.setError('name', { message: 'Nama kategori sudah ada' });
        setSaving(false);
        return;
      }
      const payload = { name: values.name, description: values.description || '', color: values.color };
      if (editing) {
        const { error } = await supabase.from('categories').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Kategori diperbarui' });
      } else {
        const { error } = await supabase.from('categories').insert(payload);
        if (error) throw error;
        toast({ title: 'Kategori ditambahkan' });
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
    // check if category has products
    const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category_id', deleteId);
    if (count && count > 0) {
      toast({ title: 'Tidak dapat menghapus', description: `Kategori masih memiliki ${count} produk`, variant: 'destructive' });
      setDeleteId(null);
      return;
    }
    const { error } = await supabase.from('categories').delete().eq('id', deleteId);
    if (error) {
      toast({ title: 'Gagal menghapus', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Kategori dihapus' });
      load();
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Cari kategori..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4" /> Tambah Kategori</Button>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : pageItems.length === 0 ? (
            <EmptyState icon={Tags} title="Belum ada kategori" description="Tambahkan kategori untuk mengelompokkan produk"
              action={<Button onClick={openNew} size="sm"><Plus className="w-4 h-4" /> Tambah Kategori</Button>} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Warna</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead className="text-right">Jumlah Produk</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: c.color }} />
                          <span className="text-xs text-muted-foreground">{c.color}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.description || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="gap-1">
                          <Package className="w-3 h-3" /> {c.product_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <p className="text-xs text-muted-foreground">
                  {currentPage * PAGE_SIZE + 1}-{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} dari {filtered.length}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Kategori' : 'Tambah Kategori'}</DialogTitle>
            <DialogDescription>Lengkapi data kategori</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nama Kategori *</Label>
              <Input {...form.register('name')} placeholder="Minuman" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Textarea {...form.register('description')} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Warna</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => form.setValue('color', c)}
                    className={cn('w-8 h-8 rounded-full border-2 transition-all', form.watch('color') === c ? 'border-foreground scale-110' : 'border-transparent')}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              {form.formState.errors.color && (
                <p className="text-xs text-destructive">{form.formState.errors.color.message}</p>
              )}
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

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Kategori?</AlertDialogTitle>
            <AlertDialogDescription>Kategori yang masih memiliki produk tidak dapat dihapus.</AlertDialogDescription>
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
