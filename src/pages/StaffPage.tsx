import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import type { Profile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/states';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserCog, Plus, Pencil, KeyRound, Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export default function StaffPage() {
  const { signUp } = useAuthStore();
  const { toast } = useToast();
  const [staff, setStaff] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', password: '', full_name: '', jabatan: 'Kasir' });
  const [saving, setSaving] = useState(false);
  const [editStaff, setEditStaff] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', jabatan: 'Kasir' });
  const [resetStaff, setResetStaff] = useState<Profile | null>(null);
  const [resetForm, setResetForm] = useState({ password: '' });
  const [toggleStaff, setToggleStaff] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [jabatanList, setJabatanList] = useState<string[]>(['Kasir', 'Waiter', 'Barista', 'Kitchen', 'Gudang', 'Delivery']);
  const [newJabatan, setNewJabatan] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [staffRes, jabatanRes] = await Promise.all([
        supabase.from('profiles').select('*').in('role', ['staff', 'kasir']).order('created_at', { ascending: false }),
        supabase.from('jabatan_list').select('label').order('label'),
      ]);
      if (staffRes.error) throw staffRes.error;
      setStaff((staffRes.data as Profile[]) || []);
      if (jabatanRes.data && jabatanRes.data.length > 0) {
        setJabatanList(jabatanRes.data.map((r: any) => r.label));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addJabatan = async () => {
    if (!newJabatan.trim()) return;
    const { error } = await supabase.from('jabatan_list').insert({ label: newJabatan.trim() });
    if (error) {
      if (error.code === '23505') { toast({ title: 'Jabatan sudah ada', variant: 'destructive' }); }
      else { toast({ title: 'Gagal menambah jabatan', description: error.message, variant: 'destructive' }); }
      return;
    }
    setJabatanList((prev) => [...prev, newJabatan.trim()].sort());
    setNewJabatan('');
    toast({ title: 'Jabatan ditambahkan' });
  };

  const removeJabatan = async (label: string) => {
    await supabase.from('jabatan_list').delete().eq('label', label);
    setJabatanList((prev) => prev.filter((j) => j !== label));
    toast({ title: 'Jabatan dihapus' });
  };

  const addStaff = async () => {
    if (!addForm.email || !addForm.password || !addForm.full_name) {
      toast({ title: 'Lengkapi semua field', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const ok = await signUp(addForm.email, addForm.password, addForm.full_name, 'staff');
      if (!ok) throw new Error('Gagal menambah staff');
      const { data: newProfile } = await supabase.from('profiles').select('id').eq('email', addForm.email).single();
      if (newProfile) {
        await supabase.from('profiles').update({ jabatan: addForm.jabatan }).eq('id', newProfile.id);
      }
      await logAudit('Staff', 'Tambah', `Staff baru: ${addForm.email} (${addForm.jabatan})`);
      toast({ title: 'Staff ditambahkan' });
      setAddOpen(false);
      setAddForm({ email: '', password: '', full_name: '', jabatan: 'Kasir' });
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editStaff) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ full_name: editForm.full_name, jabatan: editForm.jabatan }).eq('id', editStaff.id);
      if (error) throw error;
      await logAudit('Staff', 'Edit', `Staff diubah: ${editStaff.email}`);
      toast({ title: 'Staff diperbarui' });
      setEditStaff(null);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const doReset = async () => {
    if (!resetStaff || !resetForm.password) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.admin.updateUserById(resetStaff.id, { password: resetForm.password });
      if (error) throw error;
      await logAudit('Staff', 'Edit', `Password direset: ${resetStaff.email}`);
      toast({ title: 'Password direset' });
      setResetStaff(null);
      setResetForm({ password: '' });
    } catch (e: any) {
      toast({ title: 'Gagal reset password', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: Profile) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_active: !s.is_active }).eq('id', s.id);
      if (error) throw error;
      await logAudit('Staff', s.is_active ? 'Nonaktifkan' : 'Aktifkan', `Staff: ${s.email}`);
      toast({ title: s.is_active ? 'Staff dinonaktifkan' : 'Staff diaktifkan' });
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    }
  };

  const filtered = staff.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch = !search || s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || (statusFilter === 'active' && s.is_active) || (statusFilter === 'inactive' && !s.is_active);
    return matchSearch && matchStatus;
  });

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Staff</h2>
          <p className="text-sm text-muted-foreground">Kelola data staff kasir, waiter, barista, dll</p>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4" /> Tambah Staff</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Cari staff..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="inactive">Nonaktif</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {filtered.length === 0 ? <EmptyState icon={UserCog} title="Tidak ada staff" /> :
            <ScrollArea className="max-h-[55vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Jabatan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium text-sm">{s.full_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.email}</TableCell>
                      <TableCell className="text-sm">{s.jabatan || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={s.is_active ? 'default' : 'destructive'}>{s.is_active ? 'Aktif' : 'Nonaktif'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditStaff(s); setEditForm({ full_name: s.full_name, jabatan: s.jabatan || 'Kasir' }); }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setResetStaff(s); setResetForm({ password: '' }); }}><KeyRound className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setToggleStaff(s)}><UserCog className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>}
        </CardContent>
      </Card>

      {/* Jabatan Management */}
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Jabatan Staff</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Jabatan baru..." value={newJabatan} onChange={(e) => setNewJabatan(e.target.value)} />
            <Button size="sm" onClick={addJabatan}><Plus className="w-4 h-4" /> Tambah</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {jabatanList.map((j) => (
              <Badge key={j} variant="secondary" className="flex items-center gap-1">
                {j}
                <button onClick={() => removeJabatan(j)} className="ml-1 hover:text-destructive"><X className="w-3 h-3" /></button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Staff Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Staff</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nama Lengkap</Label><Input value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Jabatan</Label>
              <Select value={addForm.jabatan} onValueChange={(v) => setAddForm({ ...addForm, jabatan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{jabatanList.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button onClick={addStaff} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Staff Dialog */}
      <Dialog open={!!editStaff} onOpenChange={(v) => !v && setEditStaff(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Staff</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nama Lengkap</Label><Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Jabatan</Label>
              <Select value={editForm.jabatan} onValueChange={(v) => setEditForm({ ...editForm, jabatan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{jabatanList.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditStaff(null)}>Batal</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetStaff} onOpenChange={(v) => !v && setResetStaff(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password</DialogTitle><DialogDescription>{resetStaff?.email}</DialogDescription></DialogHeader>
          <div className="space-y-3"><div className="space-y-1.5"><Label>Password Baru</Label><Input type="password" value={resetForm.password} onChange={(e) => setResetForm({ password: e.target.value })} /></div></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetStaff(null)}>Batal</Button>
            <Button onClick={doReset} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reset'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toggle Active Dialog */}
      <AlertDialog open={!!toggleStaff} onOpenChange={(v) => !v && setToggleStaff(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggleStaff?.is_active ? 'Nonaktifkan' : 'Aktifkan'} staff?</AlertDialogTitle>
            <AlertDialogDescription>{toggleStaff?.email}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (toggleStaff) toggleActive(toggleStaff); setToggleStaff(null); }} className={cn(buttonVariants({ variant: 'destructive' }))}>Konfirmasi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
