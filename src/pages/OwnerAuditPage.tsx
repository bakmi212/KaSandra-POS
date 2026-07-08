// OwnerAuditPage - Audit Log moved from Settings
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AuditLog } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ErrorState, EmptyState } from '@/components/states';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollText, Search, Download, RefreshCw } from 'lucide-react';

const PAGE_SIZE = 20;

export default function OwnerAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(async (reset = false) => {
    if (reset) {
      setPage(0);
      setLogs([]);
    }
    setLoading(true);
    setError(null);
    try {
      const currentPage = reset ? 0 : page;
      let q = supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);
      if (search) q = q.or(`activity.ilike.%${search}%,description.ilike.%${search}%,user_email.ilike.%${search}%`);
      if (moduleFilter !== 'all') q = q.eq('module', moduleFilter);
      const { data, error: err } = await q;
      if (err) throw err;
      if (reset) {
        setLogs((data as AuditLog[]) || []);
      } else {
        setLogs((prev) => [...prev, ...((data as AuditLog[]) || [])]);
      }
      setHasMore(((data as AuditLog[])?.length || 0) === PAGE_SIZE);
      if (!reset) setPage(currentPage + 1);
      else setPage(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, moduleFilter, page]);

  useEffect(() => { load(true); }, [moduleFilter]);

  const exportCSV = async () => {
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(1000);
    if (!data) return;
    const csv = [
      ['Waktu', 'User', 'Module', 'Aktivitas', 'Deskripsi', 'IP'],
      ...data.map((l: any) => [new Date(l.created_at).toLocaleString('id-ID'), l.user_email || '-', l.module, l.activity, l.description, l.ip_address || '-']),
    ].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const moduleBadge = (m: string) => {
    const colors: Record<string, string> = { Auth: 'bg-sky-500', Penjualan: 'bg-emerald-500', Pembelian: 'bg-amber-500', Stok: 'bg-rose-500', Pengaturan: 'bg-violet-500', Owner: 'bg-amber-500', Staff: 'bg-blue-500' };
    return <Badge className={`${colors[m] || 'bg-gray-500'} text-white text-[10px]`}>{m}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Audit Log</h2>
          <p className="text-sm text-muted-foreground">Riwayat aktivitas sistem</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4" /> Export</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Cari aktivitas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" onKeyDown={(e) => e.key === 'Enter' && load(true)} />
        </div>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Module</SelectItem>
            <SelectItem value="Auth">Auth</SelectItem>
            <SelectItem value="Penjualan">Penjualan</SelectItem>
            <SelectItem value="Pembelian">Pembelian</SelectItem>
            <SelectItem value="Stok">Stok</SelectItem>
            <SelectItem value="Pengaturan">Pengaturan</SelectItem>
            <SelectItem value="Owner">Owner</SelectItem>
            <SelectItem value="Staff">Staff</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => load(true)}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading && logs.length === 0 ? (
            <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => load(true)} />
          ) : logs.length === 0 ? (
            <EmptyState icon={ScrollText} title="Tidak ada log" />
          ) : (
            <ScrollArea className="max-h-[65vh]">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Waktu</TableHead><TableHead>User</TableHead><TableHead>Module</TableHead><TableHead>Aktivitas</TableHead><TableHead>Deskripsi</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString('id-ID')}</TableCell>
                      <TableCell className="text-sm">{l.user_email || '-'}</TableCell>
                      <TableCell>{moduleBadge(l.module)}</TableCell>
                      <TableCell className="text-sm">{l.activity}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{l.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {hasMore && logs.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => load(false)} disabled={loading}>
            {loading ? 'Memuat...' : 'Muat Lebih Banyak'}
          </Button>
        </div>
      )}
    </div>
  );
}
