// OwnerUsersPage - redirects to user management from Settings
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import type { Profile, Role } from '@/lib/types';
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Plus, Pencil, KeyRound, Search, UserCog, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export default function OwnerUsersPage() {
  const { user: currentUser, signUp } = useAuthStore();
  const { toast } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ email: '', password: '', full_name: '', role: 'staff' as Role, jabatan: 'Kasir' });
  const [saving, setSaving] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', role: 'staff' as Role, jabatan: 'Kasir' });
  const [resetUser, setResetUser] = useState<Profile | null>(null);
  const [resetForm, setResetForm] = useState({ password: '' });
  const [deactivateUser, setDeactivateUser] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [jabatanList, setJabatanList] = useState<string[]>(['Kasir', 'Waiter', 'Barista', 'Kitchen', 'Gudang', 'Delivery']);
  const [newJabatan, setNewJabatan] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, jabatanRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('jabatan_list').select('label').order('label'),
      ]);
      if (usersRes.error) throw usersRes.error;
      setUsers((usersRes.data as Profile[]) || []);
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

  const addUser = async () => {
    if (!addForm.email || !addForm.password || !addForm.full_name) { toast({ title: 'Lengkapi semua field', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const ok = await signUp(addForm.email, addForm.password, addForm.full_name, addForm.role);
      if (!ok) throw new Error('Gagal menambah user');
      const { data: newProfile } = await supabase.from('profiles').select('id').eq('email', addForm.email).single();
      if (newProfile) {
        await supabase.from('profiles').update({ jabatan: addForm.jabatan }).eq('id', newProfile.id);
      }
      await logAudit('Pengguna', 'Tambah', `User baru: ${addForm.email} (${addForm.role})`);
      toast({ title: 'User ditambahkan' });
      setAddOpen(false);
      setAddForm({ email: '', password: '', full_name: '', role: 'staff', jabatan: 'Kasir' });
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({ full_name: editForm.full_name, role: editForm.role, jabatan: editForm.jabatan }).eq('id', editUser.id);
      if (error) throw error;
      await logAudit('Pengguna', 'Edit', `User diubah: ${editUser.email}`);
      toast({ title: 'User diperbarui' });
      setEditUser(null);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const doReset = async () => {
    if (!resetUser || !resetForm.password) return;
    setSaving(true);
    try {
      const { error } = await supabase.auth.admin.updateUserById(resetUser.id, { password: resetForm.password });
      if (error) throw error;
      await logAudit('Pengguna', 'Edit', `Password direset: ${resetUser.email}`);
      toast({ title: 'Password direset' });
      setResetUser(null);
      setResetForm({ password: '' });
    } catch (e: any) {
      toast({ title: 'Gagal reset password', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: Profile) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_active: !u.is_active }).eq('id', u.id);
      if (error) throw error;
      await logAudit('Pengguna', u.is_active ? 'Nonaktifkan' : 'Aktifkan', `User: ${u.email}`);
      toast({ title: u.is_active ? 'User dinonaktifkan' : 'User diaktifkan' });
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    }
  };

  const roleLabel = (role: string) => {
    if (role === 'owner') return 'Owner';
    if (role === 'admin') return 'Admin';
    return 'Staff';
  };

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !search || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = roleFilter === 'all' || u.role === roleFilter || (roleFilter === 'staff' && u.role === 'kasir');
    const matchStatus = statusFilter === 'all' || (statusFilter === 'active' && u.is_active) || (statusFilter === 'inactive' && !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Pengguna</h2>
          <p className="text-sm text-muted-foreground">Kelola semua pengguna sistem</p>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4" /> Tambah User</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Cari user..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Role</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>
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
          {filtered.length === 0 ? <EmptyState icon={Users} title="Tidak ada user" /> :
            <ScrollArea className="max-h-[55vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Jabatan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-sm">{u.full_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell><Badge variant={u.role === 'owner' ? 'default' : u.role === 'admin' ? 'default' : 'secondary'}>{roleLabel(u.role)}</Badge></TableCell>
                      <TableCell className="text-sm">{u.jabatan || '-'}</TableCell>
                      <TableCell><Badge variant={u.is_active ? 'default' : 'destructive'}>{u.is_active ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditUser(u); setEditForm({ full_name: u.full_name, role: u.role as Role, jabatan: u.jabatan || 'Kasir' }); }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setResetUser(u); setResetForm({ password: '' }); }}><KeyRound className="w-4 h-4" /></Button>
                        {u.id !== currentUser?.id && u.role !== 'owner' && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeactivateUser(u)}><UserCog className="w-4 h-4" /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>}
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nama Lengkap</Label><Input value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Role</Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Jabatan</Label>
              <Select value={addForm.jabatan} onValueChange={(v) => setAddForm({ ...addForm, jabatan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{jabatanList.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button><Button onClick={addUser} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nama Lengkap</Label><Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v as Role })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {editUser?.role === 'owner' ? (
                    <SelectItem value="owner">Owner</SelectItem>
                  ) : (
                    <>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Jabatan</Label>
              <Select value={editForm.jabatan} onValueChange={(v) => setEditForm({ ...editForm, jabatan: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{jabatanList.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditUser(null)}>Batal</Button><Button onClick={saveEdit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetUser} onOpenChange={(v) => !v && setResetUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password</DialogTitle><DialogDescription>{resetUser?.email}</DialogDescription></DialogHeader>
          <div className="space-y-3"><div className="space-y-1.5"><Label>Password Baru</Label><Input type="password" value={resetForm.password} onChange={(e) => setResetForm({ password: e.target.value })} /></div></div>
          <DialogFooter><Button variant="outline" onClick={() => setResetUser(null)}>Batal</Button><Button onClick={doReset} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reset'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <AlertDialog open={!!deactivateUser} onOpenChange={(v) => !v && setDeactivateUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{deactivateUser?.is_active ? 'Nonaktifkan' : 'Aktifkan'} user?</AlertDialogTitle><AlertDialogDescription>{deactivateUser?.email}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => { if (deactivateUser) toggleActive(deactivateUser); setDeactivateUser(null); }} className={cn(buttonVariants({ variant: 'destructive' }))}>Konfirmasi</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Jabatan Management */}
      <Card className="border-border/50">
        <CardContent className="space-y-3 pt-4">
          <p className="text-sm font-medium">Jabatan Staff</p>
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
    </div>
  );
}
