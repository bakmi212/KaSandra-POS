import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, formatRupiah, formatNumber, formatDate, formatDateShort } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/states';
import {
  FileText, FileSpreadsheet, TrendingUp, Package, Calendar, Printer,
  ShoppingCart, Boxes, Warehouse, Wallet, BarChart3,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { PURCHASE_STATUS_LABELS } from '@/lib/stock';

type Period = 'harian' | 'mingguan' | 'bulanan' | 'tahunan' | 'range';

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('bulanan');
  const [startDate, setStartDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  // data
  const [sales, setSales] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [slowProducts, setSlowProducts] = useState<{ name: string; stock: number; unit: string }[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [stockReport, setStockReport] = useState<any[]>([]);
  const [financeSummary, setFinanceSummary] = useState({ masuk: 0, keluar: 0, saldo: 0 });
  const [labarugi, setLabarugi] = useState({ revenue: 0, otherIncome: 0, hpp: 0, expenses: 0, laba: 0 });

  const dateRange = useMemo(() => {
    const now = new Date();
    let start = new Date(startDate + 'T00:00:00');
    let end = new Date(endDate + 'T23:59:59');
    if (period === 'harian') { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59); }
    else if (period === 'mingguan') { start = new Date(now); start.setDate(now.getDate() - 7); }
    else if (period === 'bulanan') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
    else if (period === 'tahunan') { start = new Date(now.getFullYear(), 0, 1); }
    return { start: start.toISOString(), end: end.toISOString() };
  }, [period, startDate, endDate]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = dateRange;
      const [s, items, allProducts, p, stockData, finTx, saleItems] = await Promise.all([
        supabase.from('sales').select('*, customer:customers(name), sale_items(*), created_by_user:auth.users!created_by(email)').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }),
        supabase.from('sale_items').select('product_name, qty, sell_price, cost_price, subtotal, created_at').gte('created_at', start).lte('created_at', end),
        supabase.from('products').select('id, name, stock, unit, is_active'),
        supabase.from('purchases').select('*, supplier:suppliers(name)').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: false }),
        supabase.from('products').select('id, name, barcode, sku, stock, minimum_stock, min_stock, unit, purchase_price, cost_price').order('name'),
        supabase.from('cash_transactions').select('amount, type, transaction_type, category:finance_categories(name)').gte('created_at', start).lte('created_at', end),
        supabase.from('sale_items').select('qty, cost_price, sell_price, created_at').gte('created_at', start).lte('created_at', end),
      ]);

      setSales((s.data || []).map((x: any) => ({
        invoice_no: x.invoice_no, date: x.created_at, customer: x.customer?.name || '-', kasir: x.created_by_user?.email || '-', total: Number(x.total), status: x.status,
      })));

      // top products
      const prodMap: Record<string, { qty: number; revenue: number }> = {};
      (items.data || []).forEach((it: any) => {
        if (!prodMap[it.product_name]) prodMap[it.product_name] = { qty: 0, revenue: 0 };
        prodMap[it.product_name].qty += Number(it.qty);
        prodMap[it.product_name].revenue += Number(it.subtotal);
      });
      setTopProducts(Object.entries(prodMap).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.qty - a.qty));

      // slow products (not sold in period)
      const soldNames = new Set((items.data || []).map((it: any) => it.product_name));
      setSlowProducts((allProducts.data || []).filter((p: any) => p.is_active && !soldNames.has(p.name)).map((p: any) => ({ name: p.name, stock: Number(p.stock), unit: p.unit })));

      setPurchases((p.data || []).map((x: any) => ({
        purchase_number: x.purchase_number || x.invoice_no, supplier: x.supplier?.name || '-', total: Number(x.total), status: x.status, date: x.created_at,
      })));

      setStockReport((stockData.data || []).map((p: any) => ({
        name: p.name, barcode: p.barcode || '-', sku: p.sku || '-', stock: Number(p.stock),
        min: Number(p.minimum_stock) || Number(p.min_stock) || 0,
        status: Number(p.stock) <= 0 ? 'Habis' : (Number(p.stock) <= (Number(p.minimum_stock) || Number(p.min_stock) || 0) ? 'Menipis' : 'Aman'),
        value: (Number(p.purchase_price) || Number(p.cost_price) || 0) * Number(p.stock),
      })));

      // finance summary
      const masuk = (finTx.data || []).filter((t: any) => (t.transaction_type || t.type) === 'masuk').reduce((s: number, t: any) => s + Number(t.amount), 0);
      const keluar = (finTx.data || []).filter((t: any) => (t.transaction_type || t.type) === 'keluar').reduce((s: number, t: any) => s + Number(t.amount), 0);
      setFinanceSummary({ masuk, keluar, saldo: masuk - keluar });

      // laba rugi
      const revenue = (finTx.data || []).filter((t: any) => t.category?.name === 'Penjualan' && (t.transaction_type || t.type) === 'masuk').reduce((s: number, t: any) => s + Number(t.amount), 0);
      const otherIncome = (finTx.data || []).filter((t: any) => t.category?.name === 'Pendapatan Lain' && (t.transaction_type || t.type) === 'masuk').reduce((s: number, t: any) => s + Number(t.amount), 0);
      const hpp = (saleItems.data || []).reduce((s: number, it: any) => s + Number(it.cost_price) * Number(it.qty), 0);
      const expensesTotal = (finTx.data || []).filter((t: any) => (t.transaction_type || t.type) === 'keluar').reduce((s: number, t: any) => s + Number(t.amount), 0);
      setLabarugi({ revenue, otherIncome, hpp, expenses: expensesTotal, laba: revenue + otherIncome - hpp - expensesTotal });
    } catch (e: any) {
      setError(e.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  // Export helpers
  const exportPDF = (type: string, headers: string[], rows: any[][], title: string) => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`KaSandra - ${title}`, 14, 18);
    doc.setFontSize(9);
    doc.text(`Periode: ${formatDateShort(dateRange.start)} - ${formatDateShort(dateRange.end)}`, 14, 24);
    doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, 30);
    autoTable(doc, { startY: 36, head: [headers], body: rows });
    doc.save(`laporan-${type}.pdf`);
  };

  const exportExcel = (type: string, data: any[]) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    XLSX.writeFile(wb, `laporan-${type}.xlsx`);
  };

  const printReport = (headers: string[], rows: string[][], title: string) => {
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:Arial;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:4px;font-size:11px;}th{background:#f5f5f5;}</style></head><body><h2>KaSandra - ${title}</h2><p>Periode: ${formatDateShort(dateRange.start)} - ${formatDateShort(dateRange.end)}</p><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const ExportButtons = ({ type, headers, rows, excelData, title }: any) => (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => exportPDF(type, headers, rows, title)}><FileText className="w-4 h-4" /> PDF</Button>
      <Button variant="outline" size="sm" onClick={() => exportExcel(type, excelData)}><FileSpreadsheet className="w-4 h-4" /> Excel</Button>
      <Button variant="outline" size="sm" onClick={() => printReport(headers, rows.map((r: any) => r.map(String)), title)}><Printer className="w-4 h-4" /> Print</Button>
    </div>
  );

  if (loading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Periode</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="harian">Harian</SelectItem>
                  <SelectItem value="mingguan">Mingguan</SelectItem>
                  <SelectItem value="bulanan">Bulanan</SelectItem>
                  <SelectItem value="tahunan">Tahunan</SelectItem>
                  <SelectItem value="range">Rentang Tanggal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {period === 'range' && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Dari</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Sampai</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
                </div>
              </>
            )}
            <Button onClick={load} disabled={loading}><Calendar className="w-4 h-4" /> Tampilkan</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="sales">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="sales">Penjualan</TabsTrigger>
          <TabsTrigger value="terlaris">Produk Terlaris</TabsTrigger>
          <TabsTrigger value="tidak-laku">Tidak Laku</TabsTrigger>
          <TabsTrigger value="pembelian">Pembelian</TabsTrigger>
          <TabsTrigger value="stok">Stok</TabsTrigger>
          <TabsTrigger value="keuangan">Keuangan</TabsTrigger>
          <TabsTrigger value="labarugi">Laba Rugi</TabsTrigger>
        </TabsList>

        {/* Penjualan */}
        <TabsContent value="sales" className="space-y-3">
          <ExportButtons type="penjualan" title="Laporan Penjualan"
            headers={['Invoice', 'Tanggal', 'Kasir', 'Pelanggan', 'Total']}
            rows={sales.map((s) => [s.invoice_no, formatDateShort(s.date), s.kasir, s.customer, formatRupiah(s.total)])}
            excelData={sales.map((s) => ({ Invoice: s.invoice_no, Tanggal: formatDateShort(s.date), Kasir: s.kasir, Pelanggan: s.customer, Total: s.total }))} />
          <Card className="border-border/50"><CardContent className="p-0">
            {sales.length === 0 ? <EmptyState icon={ShoppingCart} title="Tidak ada penjualan" /> :
              <ScrollArea className="max-h-[55vh]"><Table>
                <TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Tanggal</TableHead><TableHead>Kasir</TableHead><TableHead>Pelanggan</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>{sales.map((s) => (
                  <TableRow key={s.invoice_no}><TableCell className="font-medium text-sm">{s.invoice_no}</TableCell><TableCell className="text-sm text-muted-foreground">{formatDate(s.date)}</TableCell><TableCell className="text-sm">{s.kasir}</TableCell><TableCell className="text-sm">{s.customer}</TableCell><TableCell className="text-right font-medium">{formatRupiah(s.total)}</TableCell></TableRow>
                ))}</TableBody>
              </Table></ScrollArea>}
          </CardContent></Card>
        </TabsContent>

        {/* Produk Terlaris */}
        <TabsContent value="terlaris" className="space-y-3">
          <ExportButtons type="terlaris" title="Produk Terlaris"
            headers={['Produk', 'Qty Terjual', 'Total Penjualan']}
            rows={topProducts.map((p) => [p.name, p.qty, formatRupiah(p.revenue)])}
            excelData={topProducts.map((p) => ({ Produk: p.name, Qty: p.qty, Total: p.revenue }))} />
          <Card className="border-border/50"><CardContent className="p-0">
            {topProducts.length === 0 ? <EmptyState icon={TrendingUp} title="Tidak ada data" /> :
              <ScrollArea className="max-h-[55vh]"><Table>
                <TableHeader><TableRow><TableHead>Produk</TableHead><TableHead className="text-right">Qty Terjual</TableHead><TableHead className="text-right">Total Penjualan</TableHead></TableRow></TableHeader>
                <TableBody>{topProducts.map((p) => (
                  <TableRow key={p.name}><TableCell className="font-medium">{p.name}</TableCell><TableCell className="text-right">{formatNumber(p.qty)}</TableCell><TableCell className="text-right font-medium">{formatRupiah(p.revenue)}</TableCell></TableRow>
                ))}</TableBody>
              </Table></ScrollArea>}
          </CardContent></Card>
        </TabsContent>

        {/* Tidak Laku */}
        <TabsContent value="tidak-laku" className="space-y-3">
          <ExportButtons type="tidak-laku" title="Produk Tidak Laku"
            headers={['Produk', 'Stok Saat Ini']}
            rows={slowProducts.map((p) => [p.name, `${p.stock} ${p.unit}`])}
            excelData={slowProducts.map((p) => ({ Produk: p.name, Stok: p.stock, Unit: p.unit }))} />
          <Card className="border-border/50"><CardContent className="p-0">
            {slowProducts.length === 0 ? <EmptyState icon={Package} title="Semua produk terjual dalam periode ini" /> :
              <ScrollArea className="max-h-[55vh]"><Table>
                <TableHeader><TableRow><TableHead>Produk</TableHead><TableHead className="text-right">Stok Saat Ini</TableHead></TableRow></TableHeader>
                <TableBody>{slowProducts.map((p) => (
                  <TableRow key={p.name}><TableCell className="font-medium">{p.name}</TableCell><TableCell className="text-right">{formatNumber(p.stock)} {p.unit}</TableCell></TableRow>
                ))}</TableBody>
              </Table></ScrollArea>}
          </CardContent></Card>
        </TabsContent>

        {/* Pembelian */}
        <TabsContent value="pembelian" className="space-y-3">
          <ExportButtons type="pembelian" title="Laporan Pembelian"
            headers={['Nomor', 'Supplier', 'Tanggal', 'Total', 'Status']}
            rows={purchases.map((p) => [p.purchase_number, p.supplier, formatDateShort(p.date), formatRupiah(p.total), PURCHASE_STATUS_LABELS[p.status] || p.status])}
            excelData={purchases.map((p) => ({ Nomor: p.purchase_number, Supplier: p.supplier, Tanggal: formatDateShort(p.date), Total: p.total, Status: PURCHASE_STATUS_LABELS[p.status] || p.status }))} />
          <Card className="border-border/50"><CardContent className="p-0">
            {purchases.length === 0 ? <EmptyState icon={Boxes} title="Tidak ada pembelian" /> :
              <ScrollArea className="max-h-[55vh]"><Table>
                <TableHeader><TableRow><TableHead>Nomor</TableHead><TableHead>Supplier</TableHead><TableHead>Tanggal</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>{purchases.map((p) => (
                  <TableRow key={p.purchase_number}><TableCell className="font-medium text-sm">{p.purchase_number}</TableCell><TableCell className="text-sm">{p.supplier}</TableCell><TableCell className="text-sm text-muted-foreground">{formatDateShort(p.date)}</TableCell><TableCell className="text-right font-medium">{formatRupiah(p.total)}</TableCell><TableCell><Badge variant="outline">{PURCHASE_STATUS_LABELS[p.status] || p.status}</Badge></TableCell></TableRow>
                ))}</TableBody>
              </Table></ScrollArea>}
          </CardContent></Card>
        </TabsContent>

        {/* Stok */}
        <TabsContent value="stok" className="space-y-3">
          <ExportButtons type="stok" title="Laporan Stok"
            headers={['Produk', 'Barcode', 'SKU', 'Stok', 'Minimal', 'Status', 'Nilai']}
            rows={stockReport.map((p) => [p.name, p.barcode, p.sku, p.stock, p.min, p.status, formatRupiah(p.value)])}
            excelData={stockReport.map((p) => ({ Produk: p.name, Barcode: p.barcode, SKU: p.sku, Stok: p.stock, Minimal: p.min, Status: p.status, Nilai: p.value }))} />
          <Card className="border-border/50"><CardContent className="p-0">
            {stockReport.length === 0 ? <EmptyState icon={Warehouse} title="Tidak ada produk" /> :
              <ScrollArea className="max-h-[55vh]"><Table>
                <TableHeader><TableRow><TableHead>Produk</TableHead><TableHead>Barcode</TableHead><TableHead>SKU</TableHead><TableHead className="text-right">Stok</TableHead><TableHead className="text-right">Minimal</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Nilai</TableHead></TableRow></TableHeader>
                <TableBody>{stockReport.map((p) => (
                  <TableRow key={p.name}><TableCell className="font-medium text-sm">{p.name}</TableCell><TableCell className="text-sm text-muted-foreground">{p.barcode}</TableCell><TableCell className="text-sm text-muted-foreground">{p.sku}</TableCell><TableCell className="text-right">{formatNumber(p.stock)}</TableCell><TableCell className="text-right">{formatNumber(p.min)}</TableCell><TableCell><Badge variant={p.status === 'Habis' ? 'destructive' : p.status === 'Menipis' ? 'secondary' : 'outline'}>{p.status}</Badge></TableCell><TableCell className="text-right font-medium">{formatRupiah(p.value)}</TableCell></TableRow>
                ))}</TableBody>
              </Table></ScrollArea>}
          </CardContent></Card>
        </TabsContent>

        {/* Keuangan */}
        <TabsContent value="keuangan" className="space-y-3">
          <ExportButtons type="keuangan" title="Laporan Keuangan"
            headers={['Metrik', 'Nilai']}
            rows={[['Kas Masuk', formatRupiah(financeSummary.masuk)], ['Kas Keluar', formatRupiah(financeSummary.keluar)], ['Saldo', formatRupiah(financeSummary.saldo)]]}
            excelData={[{ Metrik: 'Kas Masuk', Nilai: financeSummary.masuk }, { Metrik: 'Kas Keluar', Nilai: financeSummary.keluar }, { Metrik: 'Saldo', Nilai: financeSummary.saldo }]} />
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border/50"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Kas Masuk</CardTitle><TrendingUp className="w-4 h-4 text-success" /></CardHeader><CardContent><div className="text-2xl font-bold text-success">{formatRupiah(financeSummary.masuk)}</div></CardContent></Card>
            <Card className="border-border/50"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Kas Keluar</CardTitle><Wallet className="w-4 h-4 text-destructive" /></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{formatRupiah(financeSummary.keluar)}</div></CardContent></Card>
            <Card className="border-border/50"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Saldo</CardTitle><BarChart3 className="w-4 h-4 text-primary" /></CardHeader><CardContent><div className="text-2xl font-bold">{formatRupiah(financeSummary.saldo)}</div></CardContent></Card>
          </div>
        </TabsContent>

        {/* Laba Rugi */}
        <TabsContent value="labarugi" className="space-y-3">
          <ExportButtons type="labarugi" title="Laporan Laba Rugi"
            headers={['Metrik', 'Nilai']}
            rows={[['Pendapatan Penjualan', formatRupiah(labarugi.revenue)], ['Pendapatan Lain', formatRupiah(labarugi.otherIncome)], ['Total Pendapatan', formatRupiah(labarugi.revenue + labarugi.otherIncome)], ['HPP', formatRupiah(labarugi.hpp)], ['Pengeluaran', formatRupiah(labarugi.expenses)], ['Laba Bersih', formatRupiah(labarugi.laba)]]}
            excelData={[
              { Metrik: 'Pendapatan Penjualan', Nilai: labarugi.revenue },
              { Metrik: 'Pendapatan Lain', Nilai: labarugi.otherIncome },
              { Metrik: 'Total Pendapatan', Nilai: labarugi.revenue + labarugi.otherIncome },
              { Metrik: 'HPP', Nilai: labarugi.hpp },
              { Metrik: 'Pengeluaran', Nilai: labarugi.expenses },
              { Metrik: 'Laba Bersih', Nilai: labarugi.laba },
            ]} />
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-sm">Laba Rugi Sederhana</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Pendapatan Penjualan</span><span className="font-medium">{formatRupiah(labarugi.revenue)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Pendapatan Lain</span><span className="font-medium">{formatRupiah(labarugi.otherIncome)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="font-medium">Total Pendapatan</span><span className="font-bold">{formatRupiah(labarugi.revenue + labarugi.otherIncome)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">HPP</span><span className="font-medium text-destructive">- {formatRupiah(labarugi.hpp)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Pengeluaran</span><span className="font-medium text-destructive">- {formatRupiah(labarugi.expenses)}</span></div>
              <div className="flex justify-between py-3 bg-muted/50 rounded-lg px-3"><span className="font-bold">Laba Bersih</span><span className={`font-bold text-lg ${labarugi.laba >= 0 ? 'text-success' : 'text-destructive'}`}>{formatRupiah(labarugi.laba)}</span></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
