import { useEffect, useState, useCallback } from 'react';
import { supabase, formatRupiah, formatNumber } from '@/lib/supabase';
import { useBranchStore } from '@/lib/branch-store';
import { usePermissionStore } from '@/lib/permission-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AIInsightCard } from '@/components/AIAssistant';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/states';
import { Package, Tags, Truck, Users, TrendingUp, ShoppingBag, AlertTriangle, Boxes, Warehouse, XCircle, ShoppingCart, Wallet, TrendingDown, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';

interface Stats {
  totalProducts: number;
  totalCategories: number;
  totalSuppliers: number;
  totalCustomers: number;
  lowStockCount: number;
  outStockCount: number;
  activeProducts: number;
  omzetToday: number;
  transaksiToday: number;
  produkTerjualToday: number;
  inventoryValue: number;
  purchasesThisMonth: number;
  incomeToday: number;
  expenseToday: number;
  cashBalance: number;
  labaToday: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiInsights, setAiInsights] = useState('');
  const [aiRecs, setAiRecs] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [salesChart, setSalesChart] = useState<{ day: string; omzet: number }[]>([]);
  const [financeChart, setFinanceChart] = useState<{ month: string; masuk: number; keluar: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number }[]>([]);
  const { activeBranch } = useBranchStore();
  const { hasDashboardWidget } = usePermissionStore();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

      const startWeek = new Date(now); startWeek.setDate(now.getDate() - 6); startWeek.setHours(0, 0, 0, 0);
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [p, c, s, cu, lowStockRes, salesToday, itemsToday, prodData, purchasesMonth, finToday, cashAcc, salesWeek, finMonth, topItems] = await Promise.all([
        supabase.from('products').select('id, is_active, stock, minimum_stock, min_stock, name, purchase_price, cost_price, selling_price, sell_price', { count: 'exact' }),
        supabase.from('categories').select('id', { count: 'exact' }),
        supabase.from('suppliers').select('id', { count: 'exact' }),
        supabase.from('customers').select('id', { count: 'exact' }),
        supabase.from('products').select('id, name, stock, minimum_stock, min_stock, unit').lt('stock', 10).order('stock', { ascending: true }).limit(8),
        supabase.from('sales').select('total, grand_total').eq('status', 'selesai').gte('created_at', startToday).lt('created_at', endToday),
        supabase.from('sale_items').select('qty, cost_price').gte('created_at', startToday).lt('created_at', endToday),
        supabase.from('products').select('stock, purchase_price, cost_price'),
        supabase.from('purchases').select('total').gte('created_at', startMonth),
        supabase.from('cash_transactions').select('amount, type, transaction_type').gte('created_at', startToday).lt('created_at', endToday),
        supabase.from('cash_accounts').select('current_balance'),
        supabase.from('sales').select('grand_total, total, created_at').eq('status', 'selesai').gte('created_at', startWeek.toISOString()),
        supabase.from('cash_transactions').select('amount, type, transaction_type, created_at').gte('created_at', startMonth),
        supabase.from('sale_items').select('product_name, qty').gte('created_at', startMonth),
      ]);

      if (p.error) throw p.error;

      const products = (p.data as any[]) || [];
      const lowStockItems = (lowStockRes.data as any[]) || [];
      const activeCount = products.filter((x) => x.is_active).length;
      const lowCount = products.filter((x) => Number(x.stock) <= Number(x.minimum_stock || x.min_stock || 0) && Number(x.stock) > 0).length;
      const outCount = products.filter((x) => Number(x.stock) <= 0).length;
      const invValue = (prodData.data as any[] || []).reduce((sum, x) => sum + (Number(x.purchase_price) || Number(x.cost_price) || 0) * Number(x.stock), 0);
      const purchasesThisMonth = (purchasesMonth.data as any[] || []).reduce((sum, x) => sum + Number(x.total || 0), 0);

      const todaySales = (salesToday.data as any[]) || [];
      const omzetToday = todaySales.reduce((sum, x) => sum + Number(x.grand_total || x.total || 0), 0);
      const transaksiToday = todaySales.length;
      const produkTerjualToday = (itemsToday.data as any[] || []).reduce((sum, x) => sum + Number(x.qty), 0);
      const hppToday = (itemsToday.data as any[] || []).reduce((sum, x) => sum + Number(x.cost_price) * Number(x.qty), 0);
      const finTodayData = (finToday.data as any[]) || [];
      const incomeToday = finTodayData.filter((t) => (t.transaction_type || t.type) === 'masuk').reduce((s, t) => s + Number(t.amount), 0);
      const expenseToday = finTodayData.filter((t) => (t.transaction_type || t.type) === 'keluar').reduce((s, t) => s + Number(t.amount), 0);
      const cashBalance = (cashAcc.data as any[] || []).reduce((s, a) => s + Number(a.current_balance), 0);
      const labaToday = omzetToday - hppToday - expenseToday;

      // sales chart (last 7 days)
      const weekSales = (salesWeek.data as any[]) || [];
      const dayMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i);
        dayMap[d.toISOString().slice(0, 10)] = 0;
      }
      weekSales.forEach((s) => {
        const key = new Date(s.created_at).toISOString().slice(0, 10);
        if (key in dayMap) dayMap[key] += Number(s.grand_total || s.total || 0);
      });
      setSalesChart(Object.entries(dayMap).map(([k, v]) => ({ day: new Date(k).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }), omzet: v })));

      // finance chart (this month)
      const monthFin = (finMonth.data as any[]) || [];
      const finMap: Record<string, { masuk: number; keluar: number }> = {};
      monthFin.forEach((t) => {
        const d = new Date(t.created_at);
        const key = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        if (!finMap[key]) finMap[key] = { masuk: 0, keluar: 0 };
        if ((t.transaction_type || t.type) === 'masuk') finMap[key].masuk += Number(t.amount);
        else if ((t.transaction_type || t.type) === 'keluar') finMap[key].keluar += Number(t.amount);
      });
      setFinanceChart(Object.entries(finMap).map(([k, v]) => ({ month: k, ...v })));

      // top 10 products
      const topMap: Record<string, number> = {};
      (topItems.data as any[] || []).forEach((it) => {
        if (!topMap[it.product_name]) topMap[it.product_name] = 0;
        topMap[it.product_name] += Number(it.qty);
      });
      setTopProducts(Object.entries(topMap).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 10));

      setStats({
        totalProducts: p.count || products.length,
        totalCategories: c.count || 0,
        totalSuppliers: s.count || 0,
        totalCustomers: cu.count || 0,
        lowStockCount: lowCount,
        outStockCount: outCount,
        activeProducts: activeCount,
        omzetToday,
        transaksiToday,
        produkTerjualToday,
        inventoryValue: invValue,
        purchasesThisMonth,
        incomeToday,
        expenseToday,
        cashBalance,
        labaToday,
      });
      setLowStock(lowStockItems);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAIInsights = useCallback(async () => {
    setAiLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'insights' }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setAiInsights(data.insights || '');
        setAiRecs(data.recommendations || []);
      }
    } catch { /* silent fail - AI is optional */ }
    finally { setAiLoading(false); }
  }, []);

  useEffect(() => { load(); loadAIInsights(); }, [load, activeBranch?.id, loadAIInsights]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={load} />;
  }

  const posCards = [
    { label: 'Omzet Hari Ini', value: formatRupiah(stats?.omzetToday || 0), sub: `${stats?.transaksiToday || 0} transaksi`, icon: TrendingUp, color: 'from-sky-500 to-blue-600' },
    { label: 'Transaksi Hari Ini', value: formatNumber(stats?.transaksiToday || 0), sub: 'selesai', icon: ShoppingBag, color: 'from-emerald-500 to-teal-600' },
    { label: 'Produk Terjual Hari Ini', value: formatNumber(stats?.produkTerjualToday || 0), sub: 'unit', icon: Boxes, color: 'from-amber-500 to-orange-600' },
    { label: 'Stok Menipis', value: formatNumber(stats?.lowStockCount || 0), sub: 'perlu restock', icon: AlertTriangle, color: 'from-rose-500 to-red-600' },
  ];

  const stockCards = [
    { label: 'Total Nilai Persediaan', value: formatRupiah(stats?.inventoryValue || 0), sub: 'estimasi nilai stok', icon: Warehouse, color: 'from-sky-500 to-blue-600' },
    { label: 'Produk Menipis', value: formatNumber(stats?.lowStockCount || 0), sub: 'perlu restock', icon: AlertTriangle, color: 'from-amber-500 to-orange-600' },
    { label: 'Produk Habis', value: formatNumber(stats?.outStockCount || 0), sub: 'stok 0', icon: XCircle, color: 'from-rose-500 to-red-600' },
    { label: 'Pembelian Bulan Ini', value: formatRupiah(stats?.purchasesThisMonth || 0), sub: 'total pembelian', icon: ShoppingCart, color: 'from-emerald-500 to-teal-600' },
  ];

  const masterCards = [
    { label: 'Total Produk', value: stats?.totalProducts || 0, sub: `${stats?.activeProducts || 0} aktif`, icon: Package, color: 'from-sky-500 to-blue-600' },
    { label: 'Total Kategori', value: stats?.totalCategories || 0, sub: 'kategori terdaftar', icon: Tags, color: 'from-emerald-500 to-teal-600' },
    { label: 'Total Supplier', value: stats?.totalSuppliers || 0, sub: 'supplier aktif', icon: Truck, color: 'from-amber-500 to-orange-600' },
    { label: 'Total Pelanggan', value: stats?.totalCustomers || 0, sub: 'pelanggan terdaftar', icon: Users, color: 'from-rose-500 to-red-600' },
  ];

  return (
    <div className="space-y-6">
      {/* POS stats */}
      {(hasDashboardWidget('omzet_today') || hasDashboardWidget('transactions_count') || hasDashboardWidget('products_sold') || hasDashboardWidget('low_stock')) && (
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Penjualan Hari Ini</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {posCards.filter((c) => {
            if (c.label === 'Omzet Hari Ini') return hasDashboardWidget('omzet_today');
            if (c.label === 'Transaksi Hari Ini') return hasDashboardWidget('transactions_count');
            if (c.label === 'Produk Terjual') return hasDashboardWidget('products_sold');
            if (c.label === 'Stok Menipis') return hasDashboardWidget('low_stock');
            return true;
          }).map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="relative overflow-hidden border-border/50">
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.color}`} />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${c.color}`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{c.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      )}

      {/* Finance stats */}
      {(hasDashboardWidget('revenue') || hasDashboardWidget('expenses') || hasDashboardWidget('cash_balance') || hasDashboardWidget('profit_today')) && (
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Keuangan Hari Ini</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="relative overflow-hidden border-border/50">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pendapatan Hari Ini</CardTitle>
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600"><TrendingUp className="w-4 h-4 text-white" /></div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-success">{formatRupiah(stats?.incomeToday || 0)}</div></CardContent>
          </Card>
          <Card className="relative overflow-hidden border-border/50">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-red-600" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pengeluaran Hari Ini</CardTitle>
              <div className="p-2 rounded-lg bg-gradient-to-br from-rose-500 to-red-600"><TrendingDown className="w-4 h-4 text-white" /></div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-destructive">{formatRupiah(stats?.expenseToday || 0)}</div></CardContent>
          </Card>
          <Card className="relative overflow-hidden border-border/50">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 to-blue-600" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Kas</CardTitle>
              <div className="p-2 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600"><Wallet className="w-4 h-4 text-white" /></div>
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{formatRupiah(stats?.cashBalance || 0)}</div></CardContent>
          </Card>
          <Card className="relative overflow-hidden border-border/50">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Laba Hari Ini</CardTitle>
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600"><BarChart3 className="w-4 h-4 text-white" /></div>
            </CardHeader>
            <CardContent><div className={`text-2xl font-bold ${(stats?.labaToday || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>{formatRupiah(stats?.labaToday || 0)}</div></CardContent>
          </Card>
        </div>
      </div>
      )}

      {/* Charts */}
      {(hasDashboardWidget('sales_chart') || hasDashboardWidget('finance_chart')) && (
      <div className="grid gap-4 md:grid-cols-2">
        {hasDashboardWidget('sales_chart') && (
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm">Grafik Penjualan (7 Hari)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={salesChart}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatRupiah(Number(v))} />
                <Line type="monotone" dataKey="omzet" name="Omzet" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        )}
        {hasDashboardWidget('finance_chart') && (
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm">Grafik Keuangan (Bulan Ini)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={financeChart}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatRupiah(Number(v))} />
                <Legend />
                <Bar dataKey="masuk" name="Kas Masuk" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="keluar" name="Kas Keluar" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        )}
      </div>
      )}

      {/* Top 10 Products */}
      {hasDashboardWidget('top_products') && topProducts.length > 0 && (
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-sm">Top 10 Produk Terlaris (Bulan Ini)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                <Tooltip />
                <Bar dataKey="qty" name="Qty Terjual" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Stock & purchasing stats */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Stok & Pembelian</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stockCards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="relative overflow-hidden border-border/50">
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.color}`} />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${c.color}`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{c.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Master data stats */}
      {hasDashboardWidget('total_customers') && (
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Master Data</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {masterCards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="relative overflow-hidden border-border/50">
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.color}`} />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${c.color}`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{c.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
      )}

      {/* Low stock */}
      {hasDashboardWidget('low_stock') && lowStock.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <p className="font-medium text-sm">Stok Menipis ({lowStock.length} produk)</p>
            </div>
            <div className="space-y-2">
              {lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-background/50">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{p.name}</span>
                  </div>
                  <span className="text-sm text-warning font-medium">
                    {Number(p.stock)} {p.unit} (min: {Number(p.minimum_stock || p.min_stock || 0)})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Insights & Recommendations */}
      <Card className="border-sky-500/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-sky-500" />
            KaSandra AI Insight
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadAIInsights} disabled={aiLoading}>
            {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </CardHeader>
        <CardContent>
          <AIInsightCard insights={aiInsights} recommendations={aiRecs} loading={aiLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
