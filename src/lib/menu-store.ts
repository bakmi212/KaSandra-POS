// Menu Store - Dynamic menu from License Server
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MenuItem {
  id: string;
  title: string;
  icon: string;
  route: string;
  badge: string | null;
  group: string;
  visible: boolean;
  sortOrder: number;
  permission: string;
}

export interface MenuGroup {
  id: string;
  title: string;
  icon: string;
  sortOrder: number;
  visible: boolean;
}

interface MenuState {
  menus: MenuItem[];
  groups: MenuGroup[];
  isLoading: boolean;
  error: string | null;

  // Actions
  setMenus: (menus: MenuItem[]) => void;
  addMenu: (menu: MenuItem) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearMenus: () => void;

  // Helpers
  getVisibleMenus: () => MenuItem[];
  getMenusByGroup: (groupId: string) => MenuItem[];
  hasPermission: (route: string) => boolean;
  getSortedMenuStructure: () => { group: MenuGroup; menus: MenuItem[] }[];
}

// Default menus (fallback when offline or no connection)
const DEFAULT_MENUS: MenuItem[] = [
  { id: 'dashboard', title: 'Dashboard', icon: 'LayoutDashboard', route: 'dashboard', badge: null, group: 'main', visible: true, sortOrder: 0, permission: 'dashboard' },
  { id: 'pos', title: 'POS', icon: 'ShoppingCart', route: 'pos', badge: null, group: 'transaksi', visible: true, sortOrder: 1, permission: 'pos' },
  { id: 'products', title: 'Produk', icon: 'Package', route: 'products', badge: null, group: 'master', visible: true, sortOrder: 2, permission: 'products' },
  { id: 'categories', title: 'Kategori', icon: 'Folder', route: 'categories', badge: null, group: 'master', visible: true, sortOrder: 3, permission: 'categories' },
  { id: 'customers', title: 'Pelanggan', icon: 'Users', route: 'customers', badge: null, group: 'master', visible: true, sortOrder: 4, permission: 'customers' },
  { id: 'suppliers', title: 'Supplier', icon: 'Truck', route: 'suppliers', badge: null, group: 'master', visible: true, sortOrder: 5, permission: 'suppliers' },
  { id: 'purchases', title: 'Pembelian', icon: 'ShoppingBag', route: 'purchases', badge: null, group: 'transaksi', visible: true, sortOrder: 6, permission: 'purchases' },
  { id: 'stock', title: 'Inventory', icon: 'Warehouse', route: 'stock', badge: null, group: 'inventory', visible: true, sortOrder: 7, permission: 'stock' },
  { id: 'branches', title: 'Cabang', icon: 'Store', route: 'branches', badge: null, group: 'master', visible: true, sortOrder: 8, permission: 'branches' },
  { id: 'finance', title: 'Keuangan', icon: 'Wallet', route: 'finance', badge: null, group: 'laporan', visible: true, sortOrder: 9, permission: 'finance' },
  { id: 'reports', title: 'Laporan', icon: 'BarChart3', route: 'reports', badge: null, group: 'laporan', visible: true, sortOrder: 10, permission: 'reports' },
  { id: 'settings', title: 'Pengaturan', icon: 'Settings', route: 'settings', badge: null, group: 'sistem', visible: true, sortOrder: 11, permission: 'settings' },
];

const DEFAULT_GROUPS: MenuGroup[] = [
  { id: 'main', title: 'Utama', icon: 'Home', sortOrder: 0, visible: true },
  { id: 'master', title: 'Master Data', icon: 'Database', sortOrder: 1, visible: true },
  { id: 'transaksi', title: 'Transaksi', icon: 'Receipt', sortOrder: 2, visible: true },
  { id: 'inventory', title: 'Inventory', icon: 'Warehouse', sortOrder: 3, visible: true },
  { id: 'laporan', title: 'Laporan', icon: 'FileText', sortOrder: 4, visible: true },
  { id: 'sistem', title: 'Sistem', icon: 'Cog', sortOrder: 5, visible: true },
];

// Icon map for lucide react
export const MENU_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {};

export const useMenuStore = create<MenuState>()(
  persist(
    (set, get) => ({
      menus: DEFAULT_MENUS,
      groups: DEFAULT_GROUPS,
      isLoading: false,
      error: null,

      setMenus: (menus) => set({ menus, error: null }),

      addMenu: (menu) => set((state) => ({
        menus: [...state.menus, menu].sort((a, b) => a.sortOrder - b.sortOrder),
      })),

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      clearMenus: () => set({ menus: DEFAULT_MENUS, groups: DEFAULT_GROUPS, error: null }),

      getVisibleMenus: () => {
        return get().menus
          .filter((m) => m.visible)
          .sort((a, b) => a.sortOrder - b.sortOrder);
      },

      getMenusByGroup: (groupId) => {
        return get().menus
          .filter((m) => m.group === groupId && m.visible)
          .sort((a, b) => a.sortOrder - b.sortOrder);
      },

      hasPermission: (route) => {
        const menu = get().menus.find((m) => m.route === route);
        if (!menu) return false;
        return menu.visible && menu.permission !== '';
      },

      getSortedMenuStructure: () => {
        const { menus, groups } = get();
        const sortedGroups = groups
          .filter((g) => g.visible)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        return sortedGroups.map((group) => ({
          group,
          menus: menus
            .filter((m) => m.group === group.id && m.visible)
            .sort((a, b) => a.sortOrder - b.sortOrder),
        }));
      },
    }),
    {
      name: 'menu-storage',
      partialize: (state) => ({ menus: state.menus, groups: state.groups }),
    }
  )
);

// Update menus from license permissions
export function updateMenusFromPermissions(permissions: string[]) {
  const { menus, setMenus } = useMenuStore.getState();

  const updatedMenus = menus.map((menu) => ({
    ...menu,
    visible: permissions.includes(menu.permission) || menu.permission === '',
  }));

  setMenus(updatedMenus);
}
