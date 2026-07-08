// WewenangPage - Admin manages Staff permissions (limited by Admin's own permissions)
// Admin can only grant permissions that Admin itself has been granted by Owner.
// Staff permissions are always a subset of Admin permissions.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { useAuthStore } from '@/lib/auth-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ShieldCheck, Lock } from 'lucide-react';

// All pages that can be delegated to Staff (must match OwnerPermissionsPage)
const MENU_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'pos', label: 'Kasir' },
  { key: 'products', label: 'Produk' },
  { key: 'categories', label: 'Kategori' },
  { key: 'suppliers', label: 'Supplier' },
  { key: 'customers', label: 'Pelanggan' },
  { key: 'purchases', label: 'Pembelian' },
  { key: 'goods-receipt', label: 'Penerimaan Barang' },
  { key: 'purchase-returns', label: 'Retur' },
  { key: 'stock', label: 'Stok' },
  { key: 'stock-transfers', label: 'Transfer Stok' },
  { key: 'branches', label: 'Cabang' },
  { key: 'finance', label: 'Keuangan' },
  { key: 'reports', label: 'Laporan' },
  { key: 'settings', label: 'Pengaturan' },
  { key: 'shifts', label: 'Absensi' },
  { key: 'owner-users', label: 'Pengguna' },
  { key: 'owner-audit', label: 'Audit Log' },
  { key: 'owner-license', label: 'Lisensi' },
  { key: 'owner-integrations', label: 'Integrasi' },
  { key: 'owner-notifications', label: 'Notifikasi' },
];

const DASHBOARD_WIDGETS = [
  { key: 'omzet_today', label: 'Omzet Hari Ini' },
  { key: 'transactions_count', label: 'Jumlah Transaksi' },
  { key: 'products_sold', label: 'Produk Terjual' },
  { key: 'low_stock', label: 'Stok Menipis' },
  { key: 'total_customers', label: 'Total Pelanggan' },
  { key: 'revenue', label: 'Pendapatan' },
  { key: 'expenses', label: 'Pengeluaran' },
  { key: 'cash_balance', label: 'Saldo Kas' },
  { key: 'profit_today', label: 'Laba Hari Ini' },
  { key: 'sales_chart', label: 'Grafik Penjualan' },
  { key: 'finance_chart', label: 'Grafik Keuangan' },
  { key: 'top_products', label: 'Produk Terlaris' },
];

export default function WewenangPage() {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [menuPerms, setMenuPerms] = useState<Record<string, boolean>>({});
  const [dashPerms, setDashPerms] = useState<Record<string, boolean>>({});
  const [adminMenuPerms, setAdminMenuPerms] = useState<Record<string, boolean>>({});
  const [adminDashPerms, setAdminDashPerms] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPerms = useCallback(async () => {
    setLoading(true);
    const [staffMenu, staffDash, adminMenu, adminDash] = await Promise.all([
      supabase.from('role_permissions').select('page_key, allowed').eq('role', 'staff'),
      supabase.from('dashboard_permissions').select('widget_key, allowed').eq('role', 'staff'),
      supabase.from('role_permissions').select('page_key, allowed').eq('role', 'admin'),
      supabase.from('dashboard_permissions').select('widget_key, allowed').eq('role', 'admin'),
    ]);

    const smp: Record<string, boolean> = {};
    (staffMenu.data || []).forEach((r: any) => { smp[r.page_key] = r.allowed; });
    const sdp: Record<string, boolean> = {};
    (staffDash.data || []).forEach((r: any) => { sdp[r.widget_key] = r.allowed; });

    const amp: Record<string, boolean> = {};
    (adminMenu.data || []).forEach((r: any) => { amp[r.page_key] = r.allowed; });
    const adp: Record<string, boolean> = {};
    (adminDash.data || []).forEach((r: any) => { adp[r.widget_key] = r.allowed; });

    setMenuPerms(smp);
    setDashPerms(sdp);
    setAdminMenuPerms(amp);
    setAdminDashPerms(adp);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPerms();
  }, [loadPerms]);

  const toggleMenu = (key: string) => {
    // Admin cannot grant a permission they don't have themselves
    if (!adminMenuPerms[key]) return;
    setMenuPerms((p) => ({ ...p, [key]: !p[key] }));
  };

  const toggleDash = (key: string) => {
    if (!adminDashPerms[key]) return;
    setDashPerms((p) => ({ ...p, [key]: !p[key] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      // Only save permissions for pages that Admin itself has access to
      const menuUpserts = Object.entries(menuPerms)
        .filter(([key]) => adminMenuPerms[key])
        .map(([page_key, allowed]) => ({
          role: 'staff', page_key, allowed, updated_at: new Date().toISOString(),
        }));
      const dashUpserts = Object.entries(dashPerms)
        .filter(([key]) => adminDashPerms[key])
        .map(([widget_key, allowed]) => ({
          role: 'staff', widget_key, allowed, updated_at: new Date().toISOString(),
        }));

      if (menuUpserts.length > 0) {
        const { error } = await supabase.from('role_permissions').upsert(menuUpserts, { onConflict: 'role,page_key' });
        if (error) throw error;
      }
      if (dashUpserts.length > 0) {
        const { error } = await supabase.from('dashboard_permissions').upsert(dashUpserts, { onConflict: 'role,widget_key' });
        if (error) throw error;
      }

      await logAudit(user?.full_name || 'Admin', 'Update', 'Mengubah wewenang Staff');
      toast({ title: 'Wewenang disimpan' });
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Wewenang</h2>
          <p className="text-sm text-muted-foreground">Atur hak akses Staff. Dibatasi oleh wewenang Anda.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-500/10 border border-sky-500/20">
        <ShieldCheck className="w-4 h-4 text-sky-500 shrink-0" />
        <p className="text-sm text-sky-600 dark:text-sky-400">
          Anda mengatur Staff. Menu yang tidak tersedia untuk Anda tidak dapat diberikan ke Staff.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Menu Permissions */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-500" /> Hak Akses Menu — Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Menu yang tidak dicentang akan tersembunyi dari Staff.
              </p>
              <div className="space-y-2">
                {MENU_ITEMS.map((m) => {
                  const allowed = adminMenuPerms[m.key] ?? false;
                  return (
                    <label
                      key={m.key}
                      className={`flex items-center gap-2 ${allowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                    >
                      <Checkbox
                        checked={menuPerms[m.key] ?? false}
                        onCheckedChange={() => toggleMenu(m.key)}
                        disabled={!allowed}
                      />
                      <span className="text-sm">{m.label}</span>
                      {!allowed && <Lock className="w-3 h-3 text-muted-foreground ml-auto" />}
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Dashboard Widgets */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Widget Dashboard — Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Widget yang tidak dicentang tidak akan ditampilkan di dashboard Staff.
              </p>
              <div className="space-y-2">
                {DASHBOARD_WIDGETS.map((w) => {
                  const allowed = adminDashPerms[w.key] ?? false;
                  return (
                    <label
                      key={w.key}
                      className={`flex items-center gap-2 ${allowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                    >
                      <Checkbox
                        checked={dashPerms[w.key] ?? false}
                        onCheckedChange={() => toggleDash(w.key)}
                        disabled={!allowed}
                      />
                      <span className="text-sm">{w.label}</span>
                      {!allowed && <Lock className="w-3 h-3 text-muted-foreground ml-auto" />}
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Simpan Perubahan
        </Button>
      </div>
    </div>
  );
}
