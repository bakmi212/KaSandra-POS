import { useState, useEffect, useCallback } from 'react';
import { AISidebar } from '@/components/AIAssistant';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { usePermissionStore, normalizeRole } from '@/lib/permission-store';
import { useBranchStore } from '@/lib/branch-store';
import { isOnline, onOnlineStatusChange } from '@/lib/offline-store';
import { fullSync, getQueueCount } from '@/lib/sync-engine';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  LayoutDashboard, ShoppingCart, Package, Tags, Truck, Users, Warehouse, Wallet,
  FileBarChart, Settings, LogOut, Menu, Moon, Sun, X, PackageCheck, RotateCcw,
  Search, Bell, AlertTriangle, XCircle, Clock, DatabaseBackup, GitBranch, ArrowLeftRight, Store, Wifi, WifiOff, RefreshCw, Sparkles,
  Crown, UserCog, Shield, Plug, ScrollText, FileKey, ShieldCheck, ServerCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type PageKey =
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'categories'
  | 'suppliers'
  | 'customers'
  | 'purchases'
  | 'goods-receipt'
  | 'purchase-returns'
  | 'stock'
  | 'stock-transfers'
  | 'branches'
  | 'finance'
  | 'reports'
  | 'shifts'
  | 'settings'
  | 'owner-staff'
  | 'owner-users'
  | 'owner-permissions'
  | 'owner-integrations'
  | 'owner-notifications'
  | 'owner-audit'
  | 'owner-license'
  | 'owner-project-integration'
  | 'admin-wewenang';

interface NavItem {
  key: PageKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  ownerOnly?: boolean;
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'pos', label: 'Kasir (POS)', icon: ShoppingCart },
  { key: 'products', label: 'Produk', icon: Package },
  { key: 'categories', label: 'Kategori', icon: Tags },
  { key: 'suppliers', label: 'Supplier', icon: Truck },
  { key: 'customers', label: 'Pelanggan', icon: Users },
  { key: 'purchases', label: 'Pembelian', icon: PackageCheck, adminOnly: true },
  { key: 'goods-receipt', label: 'Penerimaan Barang', icon: PackageCheck, adminOnly: true },
  { key: 'purchase-returns', label: 'Retur Pembelian', icon: RotateCcw, adminOnly: true },
  { key: 'stock', label: 'Stok', icon: Warehouse },
  { key: 'stock-transfers', label: 'Transfer Stok', icon: ArrowLeftRight, adminOnly: true },
  { key: 'branches', label: 'Cabang', icon: GitBranch, adminOnly: true },
  { key: 'finance', label: 'Keuangan', icon: Wallet },
  { key: 'reports', label: 'Laporan', icon: FileBarChart, adminOnly: true },
  { key: 'shifts', label: 'Absensi', icon: Clock, adminOnly: true },
  { key: 'settings', label: 'Pengaturan', icon: Settings, adminOnly: true },
];

const OWNER_NAV: NavItem[] = [
  { key: 'owner-staff', label: 'Staff', icon: UserCog, ownerOnly: true },
  { key: 'owner-users', label: 'Pengguna', icon: Users, ownerOnly: true },
  { key: 'owner-permissions', label: 'Hak Akses', icon: Shield, ownerOnly: true },
  { key: 'owner-integrations', label: 'Integrasi', icon: Plug, ownerOnly: true },
  { key: 'owner-notifications', label: 'Notifikasi', icon: Bell, ownerOnly: true },
  { key: 'owner-audit', label: 'Audit Log', icon: ScrollText, ownerOnly: true },
  { key: 'owner-license', label: 'Lisensi', icon: FileKey, ownerOnly: true },
  { key: 'owner-project-integration', label: 'License Server', icon: ServerCog, ownerOnly: true },
];

const ADMIN_NAV: NavItem[] = [
  { key: 'admin-wewenang', label: 'Wewenang', icon: ShieldCheck, adminOnly: true },
];

interface LayoutProps {
  current: PageKey;
  onNavigate: (p: PageKey) => void;
  children: React.ReactNode;
}

export default function Layout({ current, onNavigate, children }: LayoutProps) {
  const { user, signOut } = useAuthStore();
  const { load: loadPermissions, hasMenuAccess } = usePermissionStore();
  const { toast } = useToast();
  const [dark, setDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('kasandra-theme');
    const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('kasandra-theme', next ? 'dark' : 'light');
  };

  const handleSignOut = async () => {
    await signOut();
    toast({ title: 'Berhasil keluar' });
  };

  const [stockAlertCount, setStockAlertCount] = useState(0);

  useEffect(() => {
    const loadStockAlert = async () => {
      const { count } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .filter('stock', 'lte', 'minimum_stock');
      setStockAlertCount(count || 0);
    };
    loadStockAlert();
    const interval = setInterval(loadStockAlert, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user) loadPermissions(user.role);
  }, [user, loadPermissions]);

  const items = NAV.filter((n) => {
    if (normalizeRole(user?.role || 'staff') === 'owner') return true;
    if (n.ownerOnly) return false;
    return hasMenuAccess(n.key);
  });

  // Owner section: Owner sees all, Admin/Staff see only delegated owner-pages
  const role = normalizeRole(user?.role || 'staff');
  const ownerItems = role === 'owner'
    ? OWNER_NAV
    : OWNER_NAV.filter((n) => hasMenuAccess(n.key));
  const adminItems = ADMIN_NAV.filter(() => role === 'admin');

  const NavList = ({ onPick }: { onPick?: () => void }) => (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {items.map((item) => {
        const Icon = item.icon;
        const active = current === item.key;
        const showBadge = item.key === 'stock' && stockAlertCount > 0;
        return (
          <button
            key={item.key}
            onClick={() => {
              onNavigate(item.key);
              onPick?.();
            }}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">{item.label}</span>
            {showBadge && (
              <Badge variant="destructive" className="text-[10px] h-5 min-w-5 flex items-center justify-center px-1">
                {stockAlertCount}
              </Badge>
            )}
          </button>
        );
      })}

      {/* Admin Menu Section */}
      {adminItems.length > 0 && (
        <>
          <div className="px-3 pt-4 pb-2 border-t border-border mt-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-500 dark:text-sky-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin</span>
            </div>
          </div>
          {adminItems.map((item) => {
            const Icon = item.icon;
            const active = current === item.key;
            return (
              <button
                key={item.key}
                onClick={() => {
                  onNavigate(item.key);
                  onPick?.();
                }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </>
      )}

      {/* Owner Menu Section */}
      {ownerItems.length > 0 && (
        <>
          <div className="px-3 pt-4 pb-2 border-t border-border mt-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-500 dark:text-amber-400">
              <Crown className="w-3.5 h-3.5" />
              <span>{role === 'owner' ? 'Owner' : 'Delegated'}</span>
            </div>
          </div>
          {ownerItems.map((item) => {
            const Icon = item.icon;
            const active = current === item.key;
            return (
              <button
                key={item.key}
                onClick={() => {
                  onNavigate(item.key);
                  onPick?.();
                }}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-muted-foreground hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
              </button>
            );
          })}
        </>
      )}
    </nav>
  );

  const UserCard = () => (
    <div className="px-3 py-3 border-t border-border">
      <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
          {user?.full_name?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.full_name || 'User'}</p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleSignOut} className="h-8 w-8 shrink-0">
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  const currentLabel = [...NAV, ...ADMIN_NAV, ...OWNER_NAV].find((n) => n.key === current)?.label || '';

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-card border-r border-border shrink-0">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-border">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">KaSandra</h1>
            <p className="text-[10px] text-muted-foreground leading-tight">POS System</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <NavList />
        </div>
        <UserCard />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <div className="h-16 flex items-center justify-between px-5 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-base leading-tight">KaSandra</h1>
                <p className="text-[10px] text-muted-foreground leading-tight">POS System</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="h-8 w-8">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <NavList onPick={() => setMobileOpen(false)} />
          </div>
          <UserCard />
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-4 md:px-6 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
            </Sheet>
            <h2 className="text-lg font-semibold hidden sm:block">{currentLabel}</h2>
            <BranchSelector />
            <SyncStatusIndicator />
          </div>
          <div className="flex items-center gap-1">
            <GlobalSearch onNavigate={onNavigate} />
            <NotificationCenter />
            <Button variant="ghost" size="icon" onClick={toggleDark} className="h-9 w-9">
              {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin p-4 md:p-6">{children}</main>
      </div>

      {/* AI Assistant floating button */}
      <button
        onClick={() => setAiOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 shadow-lg shadow-sky-500/30 flex items-center justify-center hover:scale-105 transition-transform group"
        title="KaSandra AI"
      >
        <Sparkles className="w-6 h-6 text-white" />
        <span className="absolute right-full mr-3 px-3 py-1.5 rounded-lg bg-card border border-border text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">Tanya KaSandra AI</span>
      </button>

      <AISidebar open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}

function SyncStatusIndicator() {
  const [online, setOnline] = useState(isOnline());
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const unsub = onOnlineStatusChange((o) => {
      setOnline(o);
      if (o) doSync();
    });
    const interval = setInterval(() => { getQueueCount().then(setQueueCount); }, 5000);
    getQueueCount().then(setQueueCount);
    return () => { unsub(); clearInterval(interval); };
  }, []);

  const doSync = async () => {
    if (syncing || !isOnline()) return;
    setSyncing(true);
    try { await fullSync(); const c = await getQueueCount(); setQueueCount(c); }
    finally { setSyncing(false); }
  };

  return (
    <div className="flex items-center gap-1">
      {queueCount > 0 && (
        <Button variant="ghost" size="sm" className="h-9 px-2 text-xs gap-1.5" onClick={doSync} disabled={syncing || !online}>
          {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{queueCount} pending</span>
        </Button>
      )}
      <div className={cn('flex items-center gap-1 px-2 h-9 rounded-md text-xs font-medium', online ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400')}>
        {online ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{online ? 'Online' : 'Offline'}</span>
      </div>
    </div>
  );
}

function BranchSelector() {
  const { branches, activeBranch, setActiveBranch } = useBranchStore();
  const { user } = useAuthStore();
  if (branches.length === 0) return null;
  return (
    <Select value={activeBranch?.id || ''} onValueChange={(v) => { const b = branches.find((x) => x.id === v); if (b) setActiveBranch(b); }}>
      <SelectTrigger className="h-9 w-[140px] md:w-[180px] text-sm gap-1.5">
        <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <SelectValue placeholder="Pilih Cabang" />
      </SelectTrigger>
      <SelectContent>
        {user?.role === 'admin' && <SelectItem value="all-branches">Semua Cabang</SelectItem>}
        {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function GlobalSearch({ onNavigate }: { onNavigate: (p: PageKey) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ type: string; label: string; sub: string; page: PageKey }[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.toLowerCase().trim();
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const [p, s, c, sales, pur] = await Promise.all([
          supabase.from('products').select('name, barcode, sku').ilike('name', `%${q}%`).limit(5),
          supabase.from('suppliers').select('name').ilike('name', `%${q}%`).limit(3),
          supabase.from('customers').select('name, phone').ilike('name', `%${q}%`).limit(3),
          supabase.from('sales').select('invoice_no').ilike('invoice_no', `%${q}%`).limit(3),
          supabase.from('purchases').select('purchase_number').ilike('purchase_number', `%${q}%`).limit(3),
        ]);
        const r: { type: string; label: string; sub: string; page: PageKey }[] = [];
        (p.data || []).forEach((x: any) => r.push({ type: 'Produk', label: x.name, sub: x.barcode || x.sku || '', page: 'products' }));
        (s.data || []).forEach((x: any) => r.push({ type: 'Supplier', label: x.name, sub: '', page: 'suppliers' }));
        (c.data || []).forEach((x: any) => r.push({ type: 'Pelanggan', label: x.name, sub: x.phone || '', page: 'customers' }));
        (sales.data || []).forEach((x: any) => r.push({ type: 'Invoice', label: x.invoice_no, sub: '', page: 'pos' }));
        (pur.data || []).forEach((x: any) => r.push({ type: 'Pembelian', label: x.purchase_number, sub: '', page: 'purchases' }));
        setResults(r);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <>
      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setOpen(true)}>
        <Search className="w-5 h-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Pencarian Global</DialogTitle></DialogHeader>
          <input
            autoFocus
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            placeholder="Cari produk, supplier, pelanggan, invoice, pembelian..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-80 overflow-y-auto space-y-1">
            {searching && <p className="text-sm text-muted-foreground text-center py-4">Mencari...</p>}
            {!searching && query.length >= 2 && results.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Tidak ada hasil</p>}
            {results.map((r, i) => (
              <button
                key={i}
                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted text-left"
                onClick={() => { onNavigate(r.page); setOpen(false); setQuery(''); }}
              >
                <Badge variant="outline" className="shrink-0">{r.type}</Badge>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.label}</p>
                  {r.sub && <p className="text-xs text-muted-foreground truncate">{r.sub}</p>}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NotificationCenter() {
  const [notifications, setNotifications] = useState<{ type: string; message: string; icon: any; variant: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lowStock, outStock, pendingPurchases, settings] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).lt('stock', 10).gt('stock', 0),
        supabase.from('products').select('id', { count: 'exact', head: true }).lte('stock', 0),
        supabase.from('purchases').select('id', { count: 'exact', head: true }).in('status', ['dipesan', 'diterima_sebagian']),
        supabase.from('system_settings').select('key, value').eq('key', 'last_backup').maybeSingle(),
      ]);
      const n: { type: string; message: string; icon: any; variant: string }[] = [];
      if ((outStock.count || 0) > 0) n.push({ type: 'out', message: `${outStock.count} produk stok habis`, icon: XCircle, variant: 'destructive' });
      if ((lowStock.count || 0) > 0) n.push({ type: 'low', message: `${lowStock.count} produk stok menipis`, icon: AlertTriangle, variant: 'warning' });
      if ((pendingPurchases.count || 0) > 0) n.push({ type: 'pending', message: `${pendingPurchases.count} pembelian belum selesai`, icon: Clock, variant: 'info' });
      if (!settings.data?.value) n.push({ type: 'backup', message: 'Backup belum pernah dilakukan', icon: DatabaseBackup, variant: 'info' });
      setNotifications(n);
    } catch { setNotifications([]); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Bell className="w-5 h-5" />
          {notifications.length > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-bold">{notifications.length}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-2">
          <h3 className="font-medium text-sm border-b pb-2">Notifikasi</h3>
          {loading && <p className="text-sm text-muted-foreground py-4 text-center">Memuat...</p>}
          {!loading && notifications.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Tidak ada notifikasi</p>}
          {notifications.map((n, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/50">
              <n.icon className={cn('w-4 h-4 mt-0.5 shrink-0', n.variant === 'destructive' ? 'text-destructive' : n.variant === 'warning' ? 'text-amber-500' : 'text-primary')} />
              <p className="text-sm">{n.message}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
