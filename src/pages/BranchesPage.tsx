import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import type { Branch, Profile, BranchUser } from '@/lib/types';
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
import { Plus, Pencil, Trash2, Loader2, GitBranch, Users, Store, UserPlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export default function BranchesPage() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: '', code: '', address: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [deleteBranch, setDeleteBranch] = useState<Branch | null>(null);
  const [usersOpen, setUsersOpen] = useState<Branch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.from('branches').select('*').order('name');
      if (error) throw error;
      setBranches((data as Branch[]) || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditBranch(null);
    setForm({ name: '', code: '', address: '', phone: '' });
    setAddOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditBranch(b);
    setForm({ name: b.name, code: b.code, address: b.address, phone: b.phone });
    setAddOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.code) { toast({ title: 'Nama dan kode wajib diisi', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      if (editBranch) {
        const { error } = await supabase.from('branches').update({ name: form.name, code: form.code, address: form.address, phone: form.phone }).eq('id', editBranch.id);
        if (error) throw error;
        await logAudit('Cabang', 'Edit', `Cabang diubah: ${form.name}`);
      } else {
        const { error } = await supabase.from('branches').insert({ name: form.name, code: form.code, address: form.address, phone: form.phone, is_active: true });
        if (error) throw error;
        await logAudit('Cabang', 'Tambah', `Cabang baru: ${form.name}`);
      }
      toast({ title: 'Cabang tersimpan' });
      setAddOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!deleteBranch) return;
    try {
      const { error } = await supabase.from('branches').delete().eq('id', deleteBranch.id);
      if (error) throw error;
      await logAudit('Cabang', 'Hapus', `Cabang dihapus: ${deleteBranch.name}`);
      toast({ title: 'Cabang dihapus' });
      load();
    } catch (e: any) {
      toast({ title: 'Gagal menghapus', description: e.message, variant: 'destructive' });
    }
    setDeleteBranch(null);
  };

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={openAdd}><Plus className="w-4 h-4" /> Tambah Cabang</Button></div>
      <Card className="border-border/50"><CardContent className="p-0">
        {branches.length === 0 ? <EmptyState icon={GitBranch} title="Belum ada cabang" /> :
          <ScrollArea className="max-h-[65vh]"><Table>
            <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Kode</TableHead><TableHead>Alamat</TableHead><TableHead>Telepon</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>{branches.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium text-sm">{b.name}</TableCell>
                <TableCell><Badge variant="outline" className="font-mono">{b.code}</Badge></TableCell>
                <TableCell className="text-sm text-muted-foreground">{b.address || '-'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{b.phone || '-'}</TableCell>
                <TableCell><Badge variant={b.is_active ? 'default' : 'secondary'}>{b.is_active ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUsersOpen(b)} title="Kelola User"><Users className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteBranch(b)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></ScrollArea>}
      </CardContent></Card>

      {/* Add/Edit Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editBranch ? 'Edit Cabang' : 'Tambah Cabang'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Nama *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Kode *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="MAIN" /></div>
            </div>
            <div className="space-y-1.5"><Label>Alamat</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></div>
            <div className="space-y-1.5"><Label>Telepon</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteBranch} onOpenChange={(v) => !v && setDeleteBranch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus cabang?</AlertDialogTitle><AlertDialogDescription>{deleteBranch?.name} — stok dan data terkait akan ikut terhapus.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={doDelete} className={cn(buttonVariants({ variant: 'destructive' }))}>Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* User Assignment Dialog */}
      {usersOpen && <BranchUsersDialog branch={usersOpen} onClose={() => setUsersOpen(null)} />}
    </div>
  );
}

function BranchUsersDialog({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const { toast } = useToast();
  const [assigned, setAssigned] = useState<BranchUser[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bu, profiles] = await Promise.all([
        supabase.from('branch_users').select('*, profile:profiles(*)').eq('branch_id', branch.id),
        supabase.from('profiles').select('*').order('full_name'),
      ]);
      setAssigned((bu.data as BranchUser[]) || []);
      setAllUsers((profiles.data as Profile[]) || []);
    } catch { setAssigned([]); setAllUsers([]); } finally { setLoading(false); }
  }, [branch.id]);

  useEffect(() => { load(); }, [load]);

  const assign = async () => {
    if (!selectedUser) return;
    try {
      const { error } = await supabase.from('branch_users').insert({ branch_id: branch.id, user_id: selectedUser });
      if (error) throw error;
      await logAudit('Cabang', 'Tambah', `User ditugaskan ke cabang ${branch.name}`);
      toast({ title: 'User ditugaskan' });
      setSelectedUser('');
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    }
  };

  const unassign = async (bu: BranchUser) => {
    try {
      await supabase.from('branch_users').delete().eq('id', bu.id);
      toast({ title: 'User dicabut' });
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    }
  };

  const unassignedUsers = allUsers.filter((u) => !assigned.some((a) => a.user_id === u.id));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Store className="w-4 h-4" /> User di {branch.name}</DialogTitle><DialogDescription>Tugaskan user ke cabang ini</DialogDescription></DialogHeader>
        {loading ? <Skeleton className="h-20 w-full" /> : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Pilih user..." /></SelectTrigger>
                <SelectContent>{unassignedUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.email})</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={assign} disabled={!selectedUser}><UserPlus className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {assigned.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Belum ada user ditugaskan</p> :
                assigned.map((bu) => (
                  <div key={bu.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                    <div><p className="text-sm font-medium">{bu.profile?.full_name}</p><p className="text-xs text-muted-foreground">{bu.profile?.email}</p></div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => unassign(bu)}><X className="w-4 h-4 text-destructive" /></Button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
