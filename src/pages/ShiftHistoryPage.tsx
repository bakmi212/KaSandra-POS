import { useEffect, useState, useCallback } from 'react';
import { supabase, formatDate } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ErrorState, EmptyState } from '@/components/states';
import {
  Clock, Lock, Unlock, Search,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

const formatRupiah = (n: number) => 'Rp ' + (n || 0).toLocaleString('id-ID');

interface ShiftRow {
  id: string;
  cashier_name: string | null;
  opening_balance: number;
  closing_balance: number | null;
  total_sales: number;
  total_cash: number;
  total_qris: number;
  total_ewallet: number;
  total_transfer: number;
  physical_cash: number | null;
  difference: number | null;
  opening_note: string | null;
  closing_note: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
}

export default function ShiftHistoryPage() {
  const [items, setItems] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<ShiftRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .order('opened_at', { ascending: false });
      if (error) throw error;
      setItems((data as ShiftRow[]) || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((s) => {
    const q = search.toLowerCase();
    return !search || (s.cashier_name || '').toLowerCase().includes(q) || (s.status).toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6" /> Absensi
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Riwayat absensi kasir</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cari kasir..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Belum ada riwayat absensi"
              description="Absensi kasir akan muncul di sini setelah dibuka dan ditutup."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Kasir</TableHead>
                  <TableHead>Masuk</TableHead>
                  <TableHead>Pulang</TableHead>
                  <TableHead className="text-right">Modal Awal</TableHead>
                  <TableHead className="text-right">Penjualan</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(s)}>
                    <TableCell className="font-medium">{formatDate(s.opened_at)}</TableCell>
                    <TableCell>{s.cashier_name || '-'}</TableCell>
                    <TableCell>{new Date(s.opened_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                    <TableCell>{s.closed_at ? new Date(s.closed_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</TableCell>
                    <TableCell className="text-right">{formatRupiah(Number(s.opening_balance))}</TableCell>
                    <TableCell className="text-right">{formatRupiah(Number(s.total_sales))}</TableCell>
                    <TableCell className={`text-right font-medium ${Number(s.difference || 0) === 0 ? 'text-emerald-500' : Number(s.difference || 0) > 0 ? 'text-blue-500' : 'text-red-500'}`}>
                      {s.status === 'closed' ? formatRupiah(Number(s.difference || 0)) : '-'}
                    </TableCell>
                    <TableCell>
                      {s.status === 'open' ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10">
                          <Unlock className="w-3 h-3 mr-1" /> Buka
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Lock className="w-3 h-3 mr-1" /> Tutup
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Clock className="w-5 h-5" /> Detail Absensi</DialogTitle>
            <DialogDescription>
              {detail?.cashier_name} — {detail?.opened_at ? formatDate(detail.opened_at) : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Unlock className="w-3 h-3" /> Masuk</p>
                  <p className="font-medium">{new Date(detail.opened_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="w-3 h-3" /> Pulang</p>
                  <p className="font-medium">{detail.closed_at ? new Date(detail.closed_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Modal Awal</p>
                  <p className="font-semibold">{formatRupiah(Number(detail.opening_balance))}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Total Penjualan</p>
                  <p className="font-semibold">{formatRupiah(Number(detail.total_sales))}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Total Cash</p>
                  <p className="font-medium">{formatRupiah(Number(detail.total_cash))}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Total QRIS</p>
                  <p className="font-medium">{formatRupiah(Number(detail.total_qris))}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Total E-Wallet</p>
                  <p className="font-medium">{formatRupiah(Number(detail.total_ewallet))}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Total Transfer</p>
                  <p className="font-medium">{formatRupiah(Number(detail.total_transfer))}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Kas Fisik</p>
                  <p className="font-medium">{detail.physical_cash != null ? formatRupiah(Number(detail.physical_cash)) : '-'}</p>
                </div>
                <div className={`p-3 rounded-lg ${Number(detail.difference || 0) === 0 ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                  <p className="text-xs text-muted-foreground">Selisih</p>
                  <p className={`font-bold ${Number(detail.difference || 0) === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {detail.status === 'closed' ? formatRupiah(Number(detail.difference || 0)) : '-'}
                  </p>
                </div>
              </div>
              {detail.opening_note && (
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground mb-1">Catatan Masuk</p>
                  <p className="text-sm">{detail.opening_note}</p>
                </div>
              )}
              {detail.closing_note && (
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground mb-1">Catatan Pulang</p>
                  <p className="text-sm">{detail.closing_note}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
