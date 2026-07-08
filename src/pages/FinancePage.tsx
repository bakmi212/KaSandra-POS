import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase, formatRupiah, formatDate, formatDateShort } from '@/lib/supabase';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/hooks/use-toast';
import { adjustAccountBalance, generateReferenceNumber, TRANSACTION_TYPE_LABELS } from '@/lib/finance';
import type { CashAccount, FinanceCategory, CashTransaction, CashTransfer } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Plus, Wallet, Loader2, TrendingUp, TrendingDown, ArrowLeftRight, Tags,
  BookOpen, BarChart3, Search, Trash2, Pencil, Banknote, FileText, FileSpreadsheet, Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const PAGE_SIZE = 10;

export default function FinancePage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [transfers, setTransfers] = useState<CashTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // dialogs
  const [txOpen, setTxOpen] = useState(false);
  const [txType, setTxType] = useState<'masuk' | 'keluar'>('masuk');
  const [txForm, setTxForm] = useState({ account_id: '', category_id: '', amount: 0, description: '', attachment: '' });
  const [txSaving, setTxSaving] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({ from_account: '', to_account: '', amount: 0, notes: '' });
  const [transferSaving, setTransferSaving] = useState(false);

  const [accOpen, setAccOpen] = useState(false);
  const [accForm, setAccForm] = useState({ name: '', opening_balance: 0 });
  const [accSaving, setAccSaving] = useState(false);
  const [editingAcc, setEditingAcc] = useState<CashAccount | null>(null);
  const [deleteAccId, setDeleteAccId] = useState<string | null>(null);

  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', type: 'pendapatan' as 'pendapatan' | 'pengeluaran' });
  const [catSaving, setCatSaving] = useState(false);
  const [editingCat, setEditingCat] = useState<FinanceCategory | null>(null);
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);

  const [deleteTxId, setDeleteTxId] = useState<string | null>(null);

  // filters
  const [bookSearch, setBookSearch] = useState('');
  const [bookAccount, setBookAccount] = useState('all');
  const [bookCategory, setBookCategory] = useState('all');
  const [bookPage, setBookPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, c, t, tr] = await Promise.all([
        supabase.from('cash_accounts').select('*').order('name'),
        supabase.from('finance_categories').select('*').order('type, name'),
        supabase.from('cash_transactions').select('*, account:cash_accounts(*), category:finance_categories(*)').order('created_at', { ascending: false }).limit(500),
        supabase.from('cash_transfers').select('*, fromAccount:cash_accounts!from_account(*), toAccount:cash_accounts!to_account(*)').order('created_at', { ascending: false }).limit(200),
      ]);
      if (a.error) throw a.error;
      setAccounts((a.data as CashAccount[]) || []);
      setCategories((c.data as FinanceCategory[]) || []);
      setTransactions((t.data as CashTransaction[]) || []);
      setTransfers((tr.data as CashTransfer[]) || []);
    } catch (e: any) {
      setError(e.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived stats
  const totalIn = transactions.filter((t) => (t.transaction_type || t.type) === 'masuk').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = transactions.filter((t) => (t.transaction_type || t.type) === 'keluar').reduce((s, t) => s + Number(t.amount), 0);
  const totalBalance = accounts.reduce((s, a) => s + Number(a.current_balance), 0);

  // Monthly chart data
  const monthlyData = useMemo(() => {
    const map: Record<string, { month: string; masuk: number; keluar: number }> = {};
    transactions.forEach((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
      if (!map[key]) map[key] = { month: label, masuk: 0, keluar: 0 };
      const tt = t.transaction_type || t.type;
      if (tt === 'masuk') map[key].masuk += Number(t.amount);
      else if (tt === 'keluar') map[key].keluar += Number(t.amount);
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [transactions]);

  // Buku Kas with running balance
  const bookFiltered = useMemo(() => {
    let list = [...transactions].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (bookAccount !== 'all') list = list.filter((t) => t.account_id === bookAccount);
    if (bookCategory !== 'all') list = list.filter((t) => t.category_id === bookCategory);
    const q = bookSearch.toLowerCase().trim();
    if (q) list = list.filter((t) => (t.description || '').toLowerCase().includes(q) || (t.reference_number || t.reference || '').toLowerCase().includes(q));
    return list;
  }, [transactions, bookAccount, bookCategory, bookSearch]);

  const bookWithBalance = useMemo(() => {
    let running = 0;
    const acctId = bookAccount !== 'all' ? bookAccount : null;
    const startBalance = acctId ? Number(accounts.find((a) => a.id === acctId)?.opening_balance || 0) : 0;
    running = startBalance;
    return bookFiltered.map((t) => {
      const tt = t.transaction_type || t.type;
      const debit = tt === 'masuk' ? Number(t.amount) : 0;
      const kredit = tt === 'keluar' ? Number(t.amount) : 0;
      running += debit - kredit;
      return { ...t, debit, kredit, runningBalance: running };
    }).reverse();
  }, [bookFiltered, bookAccount, accounts]);

  const bookTotalPages = Math.max(1, Math.ceil(bookWithBalance.length / PAGE_SIZE));
  const bookCurrentPage = Math.min(bookPage, bookTotalPages - 1);
  const bookPageItems = bookWithBalance.slice(bookCurrentPage * PAGE_SIZE, bookCurrentPage * PAGE_SIZE + PAGE_SIZE);

  // Laba Rugi
  const salesRevenue = transactions.filter((t) => {
    const cat = categories.find((c) => c.id === t.category_id);
    return cat?.name === 'Penjualan' && (t.transaction_type || t.type) === 'masuk';
  }).reduce((s, t) => s + Number(t.amount), 0);
  const otherIncome = transactions.filter((t) => {
    const cat = categories.find((c) => c.id === t.category_id);
    return cat?.name === 'Pendapatan Lain' && (t.transaction_type || t.type) === 'masuk';
  }).reduce((s, t) => s + Number(t.amount), 0);
  const totalRevenue = salesRevenue + otherIncome;
  const expenses = transactions.filter((t) => (t.transaction_type || t.type) === 'keluar').reduce((s, t) => s + Number(t.amount), 0);
  // HPP: approximate from sale_items cost
  const [hpp, setHpp] = useState(0);
  useEffect(() => {
    supabase.from('sale_items').select('qty, cost_price, sell_price').then(({ data }) => {
      const total = (data || []).reduce((s: number, it: any) => s + Number(it.cost_price) * Number(it.qty), 0);
      setHpp(total);
    });
  }, []);
  const labaBersih = totalRevenue - hpp - expenses;

  // Handlers
  const openTx = (type: 'masuk' | 'keluar') => {
    setTxType(type);
    setTxForm({ account_id: accounts[0]?.id || '', category_id: '', amount: 0, description: '', attachment: '' });
    setTxOpen(true);
  };

  const saveTx = async () => {
    if (txForm.amount <= 0) { toast({ title: 'Nominal harus > 0', variant: 'destructive' }); return; }
    if (!txForm.account_id) { toast({ title: 'Pilih kas', variant: 'destructive' }); return; }
    setTxSaving(true);
    try {
      const refNo = generateReferenceNumber(txType === 'masuk' ? 'KM' : 'KK');
      const payload = {
        type: txType,
        transaction_type: txType,
        account_id: txForm.account_id,
        category_id: txForm.category_id || null,
        amount: txForm.amount,
        description: txForm.description,
        reference_number: refNo,
        reference: refNo,
        attachment: txForm.attachment || null,
        created_by: user?.id,
      };
      const { error } = await supabase.from('cash_transactions').insert(payload);
      if (error) throw error;
      // update account balance
      const delta = txType === 'masuk' ? txForm.amount : -txForm.amount;
      await adjustAccountBalance(txForm.account_id, delta);
      toast({ title: txType === 'masuk' ? 'Kas masuk tersimpan' : 'Kas keluar tersimpan' });
      setTxOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' });
    } finally {
      setTxSaving(false);
    }
  };

  const deleteTx = async () => {
    if (!deleteTxId) return;
    try {
      const tx = transactions.find((t) => t.id === deleteTxId);
      if (tx?.account_id) {
        const delta = (tx.transaction_type || tx.type) === 'masuk' ? -Number(tx.amount) : Number(tx.amount);
        await adjustAccountBalance(tx.account_id, delta);
      }
      await supabase.from('cash_transactions').delete().eq('id', deleteTxId);
      toast({ title: 'Transaksi dihapus' });
      load();
    } catch (e: any) {
      toast({ title: 'Gagal menghapus', description: e.message, variant: 'destructive' });
    }
    setDeleteTxId(null);
  };

  const saveTransfer = async () => {
    if (transferForm.from_account === transferForm.to_account) { toast({ title: 'Kas asal dan tujuan tidak boleh sama', variant: 'destructive' }); return; }
    if (transferForm.amount <= 0) { toast({ title: 'Nominal harus > 0', variant: 'destructive' }); return; }
    if (!transferForm.from_account || !transferForm.to_account) { toast({ title: 'Pilih kas asal dan tujuan', variant: 'destructive' }); return; }
    setTransferSaving(true);
    try {
      // check balance
      const fromAcc = accounts.find((a) => a.id === transferForm.from_account);
      if (fromAcc && Number(fromAcc.current_balance) < transferForm.amount) {
        toast({ title: 'Saldo kas tidak mencukupi', variant: 'destructive' });
        setTransferSaving(false);
        return;
      }
      const { error } = await supabase.from('cash_transfers').insert({
        from_account: transferForm.from_account,
        to_account: transferForm.to_account,
        amount: transferForm.amount,
        notes: transferForm.notes,
        created_by: user?.id,
      });
      if (error) throw error;
      await adjustAccountBalance(transferForm.from_account, -transferForm.amount);
      await adjustAccountBalance(transferForm.to_account, transferForm.amount);
      toast({ title: 'Transfer berhasil' });
      setTransferOpen(false);
      setTransferForm({ from_account: '', to_account: '', amount: 0, notes: '' });
      load();
    } catch (e: any) {
      toast({ title: 'Gagal transfer', description: e.message, variant: 'destructive' });
    } finally {
      setTransferSaving(false);
    }
  };

  const openAcc = (acc?: CashAccount) => {
    setEditingAcc(acc || null);
    setAccForm({ name: acc?.name || '', opening_balance: acc ? Number(acc.opening_balance) : 0 });
    setAccOpen(true);
  };

  const saveAcc = async () => {
    if (!accForm.name) { toast({ title: 'Nama kas wajib diisi', variant: 'destructive' }); return; }
    setAccSaving(true);
    try {
      if (editingAcc) {
        const { error } = await supabase.from('cash_accounts').update({ name: accForm.name }).eq('id', editingAcc.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cash_accounts').insert({
          name: accForm.name,
          opening_balance: accForm.opening_balance,
          current_balance: accForm.opening_balance,
          is_active: true,
        });
        if (error) throw error;
      }
      toast({ title: 'Kas tersimpan' });
      setAccOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setAccSaving(false);
    }
  };

  const deleteAcc = async () => {
    if (!deleteAccId) return;
    try {
      const { count } = await supabase.from('cash_transactions').select('id', { count: 'exact', head: true }).eq('account_id', deleteAccId);
      if (count && count > 0) { toast({ title: 'Kas tidak bisa dihapus', description: 'Masih memiliki transaksi', variant: 'destructive' }); setDeleteAccId(null); return; }
      await supabase.from('cash_accounts').delete().eq('id', deleteAccId);
      toast({ title: 'Kas dihapus' });
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    }
    setDeleteAccId(null);
  };

  const openCat = (cat?: FinanceCategory) => {
    setEditingCat(cat || null);
    setCatForm({ name: cat?.name || '', type: cat?.type || 'pendapatan' });
    setCatOpen(true);
  };

  const saveCat = async () => {
    if (!catForm.name) { toast({ title: 'Nama kategori wajib diisi', variant: 'destructive' }); return; }
    setCatSaving(true);
    try {
      if (editingCat) {
        const { error } = await supabase.from('finance_categories').update({ name: catForm.name, type: catForm.type }).eq('id', editingCat.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('finance_categories').insert({ name: catForm.name, type: catForm.type });
        if (error) throw error;
      }
      toast({ title: 'Kategori tersimpan' });
      setCatOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setCatSaving(false);
    }
  };

  const deleteCat = async () => {
    if (!deleteCatId) return;
    await supabase.from('finance_categories').delete().eq('id', deleteCatId);
    toast({ title: 'Kategori dihapus' });
    setDeleteCatId(null);
    load();
  };

  // Export helpers
  const exportBookPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text('KaSandra - Buku Kas', 14, 18);
    doc.setFontSize(9);
    doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 14, 24);
    autoTable(doc, {
      startY: 30,
      head: [['Tanggal', 'Referensi', 'Jenis', 'Keterangan', 'Debit', 'Kredit', 'Saldo']],
      body: bookWithBalance.map((t) => [
        formatDateShort(t.created_at), t.reference_number || t.reference || '',
        TRANSACTION_TYPE_LABELS[t.transaction_type || t.type] || t.type,
        t.description || '-', t.debit ? formatRupiah(t.debit) : '', t.kredit ? formatRupiah(t.kredit) : '',
        formatRupiah(t.runningBalance),
      ]),
    });
    doc.save('buku-kas.pdf');
  };

  const exportBookExcel = () => {
    const data = bookWithBalance.map((t) => ({
      Tanggal: formatDateShort(t.created_at), Referensi: t.reference_number || t.reference || '',
      Jenis: TRANSACTION_TYPE_LABELS[t.transaction_type || t.type] || t.type,
      Keterangan: t.description || '', Debit: t.debit, Kredit: t.kredit, Saldo: t.runningBalance,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Buku Kas');
    XLSX.writeFile(wb, 'buku-kas.xlsx');
  };

  const printBook = () => {
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    const rows = bookWithBalance.map((t) => `<tr><td>${formatDateShort(t.created_at)}</td><td>${t.reference_number || t.reference || ''}</td><td>${TRANSACTION_TYPE_LABELS[t.transaction_type || t.type] || t.type}</td><td>${t.description || '-'}</td><td style="text-align:right;">${t.debit ? formatRupiah(t.debit) : ''}</td><td style="text-align:right;">${t.kredit ? formatRupiah(t.kredit) : ''}</td><td style="text-align:right;">${formatRupiah(t.runningBalance)}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><title>Buku Kas</title><style>body{font-family:Arial;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:4px;font-size:11px;}th{background:#f5f5f5;}</style></head><body><h2>KaSandra - Buku Kas</h2><table><thead><tr><th>Tanggal</th><th>Referensi</th><th>Jenis</th><th>Keterangan</th><th>Debit</th><th>Kredit</th><th>Saldo</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const incomeCats = categories.filter((c) => c.type === 'pendapatan');
  const expenseCats = categories.filter((c) => c.type === 'pengeluaran');

  if (loading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="dashboard">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="masuk">Kas Masuk</TabsTrigger>
          <TabsTrigger value="keluar">Kas Keluar</TabsTrigger>
          <TabsTrigger value="transfer">Transfer</TabsTrigger>
          <TabsTrigger value="kategori">Kategori</TabsTrigger>
          <TabsTrigger value="buku">Buku Kas</TabsTrigger>
          <TabsTrigger value="arus">Arus Kas</TabsTrigger>
          <TabsTrigger value="labarugi">Laba Rugi</TabsTrigger>
        </TabsList>

        {/* Dashboard */}
        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Kas</CardTitle>
                <div className="p-2 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600"><Wallet className="w-4 h-4 text-white" /></div>
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatRupiah(totalBalance)}</div><p className="text-xs text-muted-foreground mt-1">{accounts.length} kas aktif</p></CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Kas Masuk</CardTitle>
                <TrendingUp className="w-4 h-4 text-success" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold text-success">{formatRupiah(totalIn)}</div></CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Kas Keluar</CardTitle>
                <TrendingDown className="w-4 h-4 text-destructive" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold text-destructive">{formatRupiah(totalOut)}</div></CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Selisih</CardTitle>
                <BarChart3 className="w-4 h-4 text-primary" />
              </CardHeader>
              <CardContent><div className={`text-2xl font-bold ${totalIn - totalOut >= 0 ? 'text-success' : 'text-destructive'}`}>{formatRupiah(totalIn - totalOut)}</div></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-sm">Saldo per Kas</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {accounts.map((a) => (
                  <div key={a.id} className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                    <span className="text-sm font-medium">{a.name}</span>
                    <span className="font-bold">{formatRupiah(Number(a.current_balance))}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-sm">Arus Kas Bulanan</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyData}>
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
          </div>
        </TabsContent>

        {/* Kas Masuk */}
        <TabsContent value="masuk" className="space-y-3">
          <div className="flex justify-end"><Button onClick={() => openTx('masuk')}><Plus className="w-4 h-4" /> Kas Masuk</Button></div>
          <TxTable transactions={transactions.filter((t) => (t.transaction_type || t.type) === 'masuk')} onDelete={(id) => setDeleteTxId(id)} />
        </TabsContent>

        {/* Kas Keluar */}
        <TabsContent value="keluar" className="space-y-3">
          <div className="flex justify-end"><Button onClick={() => openTx('keluar')}><Plus className="w-4 h-4" /> Kas Keluar</Button></div>
          <TxTable transactions={transactions.filter((t) => (t.transaction_type || t.type) === 'keluar')} onDelete={(id) => setDeleteTxId(id)} />
        </TabsContent>

        {/* Transfer */}
        <TabsContent value="transfer" className="space-y-3">
          <div className="flex justify-end"><Button onClick={() => setTransferOpen(true)}><ArrowLeftRight className="w-4 h-4" /> Transfer Antar Kas</Button></div>
          <Card className="border-border/50">
            <CardContent className="p-0">
              {transfers.length === 0 ? (
                <EmptyState icon={ArrowLeftRight} title="Belum ada transfer" />
              ) : (
                <ScrollArea className="max-h-[55vh]">
                  <Table>
                    <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Dari</TableHead><TableHead>Ke</TableHead><TableHead className="text-right">Nominal</TableHead><TableHead>Catatan</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {transfers.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(t.created_at)}</TableCell>
                          <TableCell className="text-sm font-medium">{t.fromAccount?.name || '-'}</TableCell>
                          <TableCell className="text-sm font-medium">{t.toAccount?.name || '-'}</TableCell>
                          <TableCell className="text-right font-medium">{formatRupiah(Number(t.amount))}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Kategori */}
        <TabsContent value="kategori" className="space-y-3">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => openAcc()}><Banknote className="w-4 h-4" /> Kelola Kas</Button>
            <Button onClick={() => openCat()}><Tags className="w-4 h-4" /> Tambah Kategori</Button>
          </div>
          {/* Kas list */}
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-sm">Daftar Kas</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead className="text-right">Saldo Awal</TableHead><TableHead className="text-right">Saldo Saat Ini</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-right">{formatRupiah(Number(a.opening_balance))}</TableCell>
                      <TableCell className="text-right font-medium">{formatRupiah(Number(a.current_balance))}</TableCell>
                      <TableCell><Badge variant={a.is_active ? 'default' : 'secondary'}>{a.is_active ? 'Aktif' : 'Nonaktif'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openAcc(a)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteAccId(a.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {/* Categories */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-sm">Pendapatan</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {incomeCats.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openCat(c)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteCatId(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader><CardTitle className="text-sm">Pengeluaran</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    {expenseCats.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openCat(c)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteCatId(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Buku Kas */}
        <TabsContent value="buku" className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Cari..." value={bookSearch} onChange={(e) => { setBookSearch(e.target.value); setBookPage(0); }} className="pl-9" />
            </div>
            <Select value={bookAccount} onValueChange={(v) => { setBookAccount(v); setBookPage(0); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Kas" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Semua Kas</SelectItem>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={bookCategory} onValueChange={(v) => { setBookCategory(v); setBookPage(0); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Kategori" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Semua Kategori</SelectItem>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportBookPDF}><FileText className="w-4 h-4" /> PDF</Button>
            <Button variant="outline" size="sm" onClick={exportBookExcel}><FileSpreadsheet className="w-4 h-4" /> Excel</Button>
            <Button variant="outline" size="sm" onClick={printBook}><Printer className="w-4 h-4" /> Print</Button>
          </div>
          <Card className="border-border/50">
            <CardContent className="p-0">
              {bookPageItems.length === 0 ? (
                <EmptyState icon={BookOpen} title="Belum ada transaksi" />
              ) : (
                <ScrollArea className="max-h-[55vh]">
                  <Table>
                    <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Referensi</TableHead><TableHead>Jenis</TableHead><TableHead>Keterangan</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {bookPageItems.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm text-muted-foreground">{formatDateShort(t.created_at)}</TableCell>
                          <TableCell className="text-sm font-mono">{t.reference_number || t.reference || '-'}</TableCell>
                          <TableCell><Badge variant="outline">{TRANSACTION_TYPE_LABELS[t.transaction_type || t.type] || t.type}</Badge></TableCell>
                          <TableCell className="text-sm">{t.description || '-'}</TableCell>
                          <TableCell className="text-right text-success">{t.debit ? formatRupiah(t.debit) : '-'}</TableCell>
                          <TableCell className="text-right text-destructive">{t.kredit ? formatRupiah(t.kredit) : '-'}</TableCell>
                          <TableCell className="text-right font-medium">{formatRupiah(t.runningBalance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Arus Kas */}
        <TabsContent value="arus" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Kas Masuk</CardTitle><TrendingUp className="w-4 h-4 text-success" /></CardHeader>
              <CardContent><div className="text-2xl font-bold text-success">{formatRupiah(totalIn)}</div></CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Kas Keluar</CardTitle><TrendingDown className="w-4 h-4 text-destructive" /></CardHeader>
              <CardContent><div className="text-2xl font-bold text-destructive">{formatRupiah(totalOut)}</div></CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Saldo Akhir</CardTitle><Wallet className="w-4 h-4 text-primary" /></CardHeader>
              <CardContent><div className="text-2xl font-bold">{formatRupiah(totalIn - totalOut)}</div></CardContent>
            </Card>
          </div>
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-sm">Grafik Arus Kas Bulanan</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyData}>
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
        </TabsContent>

        {/* Laba Rugi */}
        <TabsContent value="labarugi" className="space-y-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-sm">Laba Rugi Sederhana</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Pendapatan Penjualan</span><span className="font-medium">{formatRupiah(salesRevenue)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Pendapatan Lain</span><span className="font-medium">{formatRupiah(otherIncome)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="font-medium">Total Pendapatan</span><span className="font-bold">{formatRupiah(totalRevenue)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Harga Pokok Penjualan (HPP)</span><span className="font-medium text-destructive">- {formatRupiah(hpp)}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Pengeluaran Operasional</span><span className="font-medium text-destructive">- {formatRupiah(expenses)}</span></div>
              <div className="flex justify-between py-3 bg-muted/50 rounded-lg px-3">
                <span className="font-bold">Laba Bersih</span>
                <span className={`font-bold text-lg ${labaBersih >= 0 ? 'text-success' : 'text-destructive'}`}>{formatRupiah(labaBersih)}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transaction Dialog */}
      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{txType === 'masuk' ? 'Kas Masuk' : 'Kas Keluar'}</DialogTitle>
            <DialogDescription>Saldo kas akan otomatis terupdate</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Kas *</Label>
              <Select value={txForm.account_id} onValueChange={(v) => setTxForm({ ...txForm, account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih kas" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({formatRupiah(Number(a.current_balance))})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={txForm.category_id || 'none'} onValueChange={(v) => setTxForm({ ...txForm, category_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tanpa kategori</SelectItem>
                  {(txType === 'masuk' ? incomeCats : expenseCats).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nominal *</Label>
              <Input type="number" min={0} value={txForm.amount || ''} onChange={(e) => setTxForm({ ...txForm, amount: Number(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label>Keterangan</Label>
              <Textarea value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Lampiran (URL, opsional)</Label>
              <Input value={txForm.attachment} onChange={(e) => setTxForm({ ...txForm, attachment: e.target.value })} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxOpen(false)}>Batal</Button>
            <Button onClick={saveTx} disabled={txSaving}>{txSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer Antar Kas</DialogTitle>
            <DialogDescription>Saldo kas asal dan tujuan akan otomatis terupdate</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Dari Kas *</Label>
              <Select value={transferForm.from_account} onValueChange={(v) => setTransferForm({ ...transferForm, from_account: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih kas asal" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({formatRupiah(Number(a.current_balance))})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ke Kas *</Label>
              <Select value={transferForm.to_account} onValueChange={(v) => setTransferForm({ ...transferForm, to_account: v })}>
                <SelectTrigger><SelectValue placeholder="Pilih kas tujuan" /></SelectTrigger>
                <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nominal *</Label>
              <Input type="number" min={0} value={transferForm.amount || ''} onChange={(e) => setTransferForm({ ...transferForm, amount: Number(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Textarea value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Batal</Button>
            <Button onClick={saveTransfer} disabled={transferSaving}>{transferSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Transfer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Dialog */}
      <Dialog open={accOpen} onOpenChange={setAccOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingAcc ? 'Edit Kas' : 'Tambah Kas'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nama Kas *</Label><Input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} /></div>
            {!editingAcc && <div className="space-y-1.5"><Label>Saldo Awal</Label><Input type="number" min={0} value={accForm.opening_balance || ''} onChange={(e) => setAccForm({ ...accForm, opening_balance: Number(e.target.value) || 0 })} /></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAccOpen(false)}>Batal</Button><Button onClick={saveAcc} disabled={accSaving}>{accSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCat ? 'Edit Kategori' : 'Tambah Kategori'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nama *</Label><Input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Tipe</Label>
              <Select value={catForm.type} onValueChange={(v) => setCatForm({ ...catForm, type: v as 'pendapatan' | 'pengeluaran' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pendapatan">Pendapatan</SelectItem><SelectItem value="pengeluaran">Pengeluaran</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCatOpen(false)}>Batal</Button><Button onClick={saveCat} disabled={catSaving}>{catSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmations */}
      <AlertDialog open={!!deleteTxId} onOpenChange={(v) => !v && setDeleteTxId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus transaksi?</AlertDialogTitle><AlertDialogDescription>Saldo kas akan dikembalikan.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={deleteTx} className={cn(buttonVariants({ variant: 'destructive' }))}>Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteAccId} onOpenChange={(v) => !v && setDeleteAccId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus kas?</AlertDialogTitle><AlertDialogDescription>Kas dengan transaksi tidak dapat dihapus.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={deleteAcc} className={cn(buttonVariants({ variant: 'destructive' }))}>Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!deleteCatId} onOpenChange={(v) => !v && setDeleteCatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hapus kategori?</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={deleteCat} className={cn(buttonVariants({ variant: 'destructive' }))}>Hapus</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TxTable({ transactions, onDelete }: { transactions: CashTransaction[]; onDelete: (id: string) => void }) {
  if (transactions.length === 0) return <EmptyState icon={Wallet} title="Belum ada transaksi" />;
  return (
    <Card className="border-border/50">
      <CardContent className="p-0">
        <ScrollArea className="max-h-[55vh]">
          <Table>
            <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Referensi</TableHead><TableHead>Kas</TableHead><TableHead>Kategori</TableHead><TableHead>Keterangan</TableHead><TableHead className="text-right">Nominal</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm text-muted-foreground">{formatDateShort(t.created_at)}</TableCell>
                  <TableCell className="text-sm font-mono">{t.reference_number || t.reference || '-'}</TableCell>
                  <TableCell className="text-sm">{t.account?.name || '-'}</TableCell>
                  <TableCell className="text-sm">{t.category?.name || '-'}</TableCell>
                  <TableCell className="text-sm">{t.description || '-'}</TableCell>
                  <TableCell className="text-right font-medium">{formatRupiah(Number(t.amount))}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(t.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
