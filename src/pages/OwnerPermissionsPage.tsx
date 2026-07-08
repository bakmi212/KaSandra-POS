// OwnerPermissionsPage - Owner manages Admin permissions (Hak Akses)
// Owner has full access. Owner decides what Admin can access.
// Changes cascade downward: removing from Admin also removes from Staff.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { logAudit } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Shield, Crown } from 'lucide-react';

// All pages that Owner can delegate to Admin
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

export default function OwnerPermissionsPage() {
  const { toast } = useToast();
  const [menuPerms, setMenuPerms] = useState<Record<string, boolean>>({});
  const [dashPerms, setDashPerms] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPerms = useCallback(async () => {
    setLoading(true);
    const [m, d] = await Promise.all([
      supabase.from('role_permissions').select('page_key, allowed').eq('role', 'admin'),
      supabase.from('dashboard_permissions').select('widget_key, allowed').eq('role', 'admin'),
    ]);
    const mp: Record<string, boolean> = {};
    (m.data || []).forEach((r: any) => { mp[r.page_key] = r.allowed; });
    const dp: Record<string, boolean> = {};
    (d.data || []).forEach((r: any) => { dp[r.widget_key] = r.allowed; });
    setMenuPerms(mp);
    setDashPerms(dp);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPerms();
  }, [loadPerms]);

  const toggleMenu = (key: string) => {
    setMenuPerms((p) => ({ ...p, [key]: !p[key] }));
  };

  const toggleDash = (key: string) => {
    setDashPerms((p) => ({ ...p, [key]: !p[key] }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const menuUpserts = Object.entries(menuPerms).map(([page_key, allowed]) => ({
        role: 'admin', page_key, allowed, updated_at: new Date().toISOString(),
      }));
      const dashUpserts = Object.entries(dashPerms).map(([widget_key, allowed]) => ({
        role: 'admin', widget_key, allowed, updated_at: new Date().toISOString(),
      }));

      if (menuUpserts.length > 0) {
        const { error } = await supabase.from('role_permissions').upsert(menuUpserts, { onConflict: 'role,page_key' });
        if (error) throw error;
      }
      if (dashUpserts.length > 0) {
        const { error } = await supabase.from('dashboard_permissions').upsert(dashUpserts, { onConflict: 'role,widget_key' });
        if (error) throw error;
      }

      // Enforce inheritance: if Owner removes a permission from Admin, also remove from Staff
      const staffMenuUpdates = Object.entries(menuPerms)
        .filter(([, allowed]) => !allowed)
        .map(([page_key]) => ({
          role: 'staff', page_key, allowed: false, updated_at: new Date().toISOString(),
        }));
      const staffDashUpdates = Object.entries(dashPerms)
        .filter(([, allowed]) => !allowed)
        .map(([widget_key]) => ({
          role: 'staff', widget_key, allowed: false, updated_at: new Date().toISOString(),
        }));

      if (staffMenuUpdates.length > 0) {
        await supabase.from('role_permissions').upsert(staffMenuUpdates, { onConflict: 'role,page_key' });
      }
      if (staffDashUpdates.length > 0) {
        await supabase.from('dashboard_permissions').upsert(staffDashUpdates, { onConflict: 'role,widget_key' });
      }

      await logAudit('Owner', 'Update', 'Mengubah hak akses Admin');
      toast({ title: 'Hak akses disimpan', description: 'Perubahan juga diterapkan ke Staff' });
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
          <h2 className="text-xl font-semibold">Hak Akses</h2>
          <p className="text-sm text-muted-foreground">Atur menu dan widget untuk Admin</p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <Crown className="w-4 h-4 text-amber-500 shrink-0" />
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Owner memiliki akses penuh. Perubahan pada Admin juga berlaku ke bawah (Staff).
        </p>
      </div>

      {/* Role indicator */}
      <div className="flex items-center gap-2">
        <Label>Role yang dikelola:</Label>
        <div className="flex gap-2">
          <Button variant="default" size="sm" disabled>
            <Shield className="w-4 h-4 mr-1" /> Admin
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Menu Permissions */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" /> Hak Akses Menu — Admin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Menu yang tidak dicentang akan tersembunyi dan tidak bisa diakses via URL.
              </p>
              <div className="space-y-2">
                {MENU_ITEMS.map((m) => (
                  <label key={m.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={menuPerms[m.key] ?? false}
                      onCheckedChange={() => toggleMenu(m.key)}
                    />
                    <span className="text-sm">{m.label}</span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Dashboard Widgets */}
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Widget Dashboard — Admin</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Widget yang tidak dicentang tidak akan ditampilkan di dashboard.
              </p>
              <div className="space-y-2">
                {DASHBOARD_WIDGETS.map((w) => (
                  <label key={w.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={dashPerms[w.key] ?? false}
                      onCheckedChange={() => toggleDash(w.key)}
                    />
                    <span className="text-sm">{w.label}</span>
                  </label>
                ))}
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
