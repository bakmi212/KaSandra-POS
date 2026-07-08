import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, formatDate } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import type { Supplier } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
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
  Plus, Search, Pencil, Trash2, Truck, Loader2, ChevronLeft, ChevronRight, AlertCircle, Eye, Mail, Phone, MapPin,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

const schema = z.object({
  name: z.string().min(1, 'Nama supplier wajib diisi'),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email tidak valid').optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const PAGE_SIZE = 8;

export default function SuppliersPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', contact_name: '', phone: '', email: '', address: '', notes: '' },
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (error) throw error;
      setItems((data as Supplier[]) || []);
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
    return items.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.contact_name || s.contact_person || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const openNew = () => {
    setEditing(null);
    form.reset({ name: '', contact_name: '', phone: '', email: '', address: '', notes: '' });
    setOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    form.reset({
      name: s.name,
      contact_name: s.contact_name || s.contact_person || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      notes: s.notes || '',
    });
    setOpen(true);
  };

  const onSubmit = async (values: FormValues) => {
    setSaving(true);
    try {
      const payload = {
        name: values.name,
        contact_name: values.contact_name || null,
        contact_person: values.contact_name || '',
        phone: values.phone || '',
        email: values.email || null,
        address: values.address || '',
        notes: values.notes || null,
      };
      if (editing) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Supplier diperbarui' });
      } else {
        const { error } = await supabase.from('suppliers').insert({ ...payload, payable: 0 });
        if (error) throw error;
        toast({ title: 'Supplier ditambahkan' });
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
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteId);
    if (error) {
      toast({ title: 'Gagal menghapus', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Supplier dihapus' });
      load();
    }
    setDeleteId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Cari supplier..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4" /> Tambah Supplier</Button>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={load} />
          ) : pageItems.length === 0 ? (
            <EmptyState icon={Truck} title="Belum ada supplier" description="Tambahkan supplier untuk mengelola pembelian"
              action={<Button onClick={openNew} size="sm"><Plus className="w-4 h-4" /> Tambah Supplier</Button>} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kontak</TableHead>
                    <TableHead>Telepon</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-sm">{s.contact_name || s.contact_person || '-'}</TableCell>
                      <TableCell className="text-sm">{s.phone || '-'}</TableCell>
                      <TableCell className="text-sm">{s.email || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDetail(s)}><Eye className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(s.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
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

      {/* Form */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Supplier' : 'Tambah Supplier'}</DialogTitle>
            <DialogDescription>Lengkapi data supplier</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nama Supplier *</Label>
              <Input {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nama Kontak</Label>
                <Input {...form.register('contact_name')} />
              </div>
              <div className="space-y-1.5">
                <Label>Nomor HP</Label>
                <Input {...form.register('phone')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" {...form.register('email')} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Alamat</Label>
              <Textarea {...form.register('address')} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Textarea {...form.register('notes')} rows={2} />
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

      {/* Detail */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Detail Supplier</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">{detail.name}</h3>
              <div className="space-y-2 text-sm">
                {((detail.contact_name || detail.contact_person) || '').trim() && (
                  <div className="flex items-center gap-2"><span className="text-muted-foreground">Kontak:</span> {detail.contact_name || detail.contact_person}</div>
                )}
                {detail.phone && (
                  <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /> {detail.phone}</div>
                )}
                {detail.email && (
                  <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /> {detail.email}</div>
                )}
                {detail.address && (
                  <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-muted-foreground mt-0.5" /> {detail.address}</div>
                )}
                {detail.notes && (
                  <div className="pt-2 border-t"><span className="text-muted-foreground text-xs">Catatan:</span><p className="mt-1">{detail.notes}</p></div>
                )}
                <div className="pt-2 border-t text-xs text-muted-foreground">Terdaftar: {formatDate(detail.created_at)}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>Tutup</Button>
            <Button onClick={() => { if (detail) { openEdit(detail); setDetail(null); } }}><Pencil className="w-4 h-4" /> Edit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Supplier?</AlertDialogTitle>
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
