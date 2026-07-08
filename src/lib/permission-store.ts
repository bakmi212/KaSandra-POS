import { create } from 'zustand';
import { supabase } from './supabase';
import type { Role } from './types';
import { useAuthStore } from './auth-store';

export const ALL_PAGE_KEYS = [
  'dashboard', 'pos', 'products', 'categories', 'suppliers',
  'customers', 'purchases', 'goods-receipt', 'purchase-returns',
  'stock', 'stock-transfers', 'branches', 'finance', 'reports',
  'shifts', 'settings',
  'owner-staff', 'owner-users', 'owner-permissions', 'owner-integrations',
  'owner-notifications', 'owner-audit', 'owner-license',
  'admin-wewenang',
] as const;

export const ALL_DASHBOARD_WIDGETS = [
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
] as const;

export const DEFAULT_JABATAN = ['Kasir', 'Waiter', 'Barista', 'Kitchen', 'Gudang', 'Delivery'];

export function normalizeRole(role: Role): 'owner' | 'admin' | 'staff' {
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  return 'staff';
}

interface PermissionState {
  menuPermissions: Record<string, boolean>;
  dashboardPermissions: Record<string, boolean>;
  loaded: boolean;
  load: (role: Role) => Promise<void>;
  hasMenuAccess: (pageKey: string) => boolean;
  hasDashboardWidget: (widgetKey: string) => boolean;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  menuPermissions: {},
  dashboardPermissions: {},
  loaded: false,

  load: async (role) => {
    const normalized = normalizeRole(role);
    const [menuRes, dashRes] = await Promise.all([
      supabase.from('role_permissions').select('page_key, allowed').eq('role', normalized),
      supabase.from('dashboard_permissions').select('widget_key, allowed').eq('role', normalized),
    ]);

    let menuData = menuRes.data;
    let dashData = dashRes.data;
    if ((!menuData || menuData.length === 0) && normalized !== role) {
      const [menuRes2, dashRes2] = await Promise.all([
        supabase.from('role_permissions').select('page_key, allowed').eq('role', role),
        supabase.from('dashboard_permissions').select('widget_key, allowed').eq('role', role),
      ]);
      menuData = menuRes2.data;
      dashData = dashRes2.data;
    }

    const menuPerms: Record<string, boolean> = {};
    (menuData || []).forEach((r: any) => { menuPerms[r.page_key] = r.allowed; });

    const dashPerms: Record<string, boolean> = {};
    (dashData || []).forEach((r: any) => { dashPerms[r.widget_key] = r.allowed; });

    if (normalized === 'owner') {
      ALL_PAGE_KEYS.forEach((k) => { if (!(k in menuPerms)) menuPerms[k] = true; });
      ALL_DASHBOARD_WIDGETS.forEach((w) => { if (!(w.key in dashPerms)) dashPerms[w.key] = true; });
    }

    set({ menuPermissions: menuPerms, dashboardPermissions: dashPerms, loaded: true });
  },

  hasMenuAccess: (pageKey) => {
    const { menuPermissions } = get();
    const { user } = useAuthStore.getState();
    if (!user) return false;
    const role = normalizeRole(user.role);
    if (role === 'owner') return true;
    if (pageKey === 'admin-wewenang') return role === 'admin';
    if (pageKey === 'owner-staff') return false;
    // Owner-specific pages can be delegated to Admin/Staff via role_permissions
    return menuPermissions[pageKey] ?? false;
  },

  hasDashboardWidget: (widgetKey) => {
    const { dashboardPermissions } = get();
    const { user } = useAuthStore.getState();
    if (!user) return false;
    if (normalizeRole(user.role) === 'owner') return true;
    return dashboardPermissions[widgetKey] ?? false;
  },
}));
