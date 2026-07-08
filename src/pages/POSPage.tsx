import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase, formatRupiah, formatNumber } from '@/lib/supabase';
import { offlineStore, isOnline } from '@/lib/offline-store';
import { logAudit } from '@/lib/audit';
import { useCartStore } from '@/lib/cart-store';
import { useAuthStore } from '@/lib/auth-store';
import { useShiftStore } from '@/lib/shift-store';
import { useToast } from '@/hooks/use-toast';
import { generateInvoiceNo, buildReceiptHTML, printReceipt, downloadReceiptPDF, getSettings, type ReceiptData } from '@/lib/receipt';
import type { Product, Customer, Category } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import {
  Plus, Minus, Trash2, ShoppingCart, Pause, Play, X, Package, Loader2,
  RotateCcw, Search, CreditCard, Banknote, CheckCircle2, Printer, Download, User,
  MessageCircle, Mail, Utensils, ShoppingBag, Bike, QrCode, Wallet, StickyNote,
  Lock, Unlock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export default function POSPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  // Use selectors to avoid re-renders from unrelated state changes
  const cartItems = useCartStore((s) => s.items);
  const cartDiscount = useCartStore((s) => s.discount);
  const cartCustomerId = useCartStore((s) => s.customerId);
  const cartCustomerName = useCartStore((s) => s.customerName);
  const cartTableNumber = useCartStore((s) => s.tableNumber);
  const cartOrderType = useCartStore((s) => s.orderType);
  const cartOrderNote = useCartStore((s) => s.orderNote);
  const cartHeldCarts = useCartStore((s) => s.heldCarts);
  const cartAdd = useCartStore((s) => s.add);
  const cartUpdateQty = useCartStore((s) => s.updateQty);
  const cartRemove = useCartStore((s) => s.remove);
  const cartClear = useCartStore((s) => s.clear);
  const cartSetDiscount = useCartStore((s) => s.setDiscount);
  const cartSetCustomer = useCartStore((s) => s.setCustomer);
  const cartSetCustomerName = useCartStore((s) => s.setCustomerName);
  const cartSetTableNumber = useCartStore((s) => s.setTableNumber);
  const cartSetOrderType = useCartStore((s) => s.setOrderType);
  const cartSetOrderNote = useCartStore((s) => s.setOrderNote);
  const cartSetItemDiscount = useCartStore((s) => s.setItemDiscount);
  const cartSetItemNote = useCartStore((s) => s.setItemNote);
  const cartHold = useCartStore((s) => s.hold);
  const cartLoadHolds = useCartStore((s) => s.loadHolds);
  const cartRecall = useCartStore((s) => s.recall);
  const cartDeleteHeld = useCartStore((s) => s.deleteHeld);
  const cartAddByBarcode = useCartStore((s) => s.addByBarcode);

  const activeShift = useShiftStore((s) => s.activeShift);
  const shiftLoadActive = useShiftStore((s) => s.loadActive);
  const shiftOpenShift = useShiftStore((s) => s.openShift);
  const shiftCloseShift = useShiftStore((s) => s.closeShift);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const barcodeRef = useRef<HTMLInputElement>(null);

  // payment dialog
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<'tunai' | 'transfer' | 'qris' | 'ewallet'>('tunai');
  const [paidAmount, setPaidAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [payNote, setPayNote] = useState('');
  const [ewalletType, setEwalletType] = useState('');
  const [processing, setProcessing] = useState(false);

  // success dialog
  const [successData, setSuccessData] = useState<ReceiptData | null>(null);

  // hold dialog
  const [heldOpen, setHeldOpen] = useState(false);

  // retur dialog
  const [returOpen, setReturOpen] = useState(false);
  const [returInvoice, setReturInvoice] = useState('');
  const [returSale, setReturSale] = useState<any>(null);
  const [returItems, setReturItems] = useState<{ id: string; product_id: string; product_name: string; qty: number; maxQty: number; returQty: number }[]>([]);
  const [returReason, setReturReason] = useState('');

  // item edit dialog
  const [itemEdit, setItemEdit] = useState<string | null>(null);
  const [itemDiscount, setItemDiscount] = useState(0);
  const [itemDiscountType, setItemDiscountType] = useState<'rp' | 'percent'>('rp');
  const [itemNote, setItemNote] = useState('');

  // clear cart confirm
  const [clearOpen, setClearOpen] = useState(false);

  // shift dialogs
  const [shiftOpenDialog, setShiftOpenDialog] = useState(false);
  const [shiftCloseDialog, setShiftCloseDialog] = useState(false);
  const [shiftModal, setShiftModal] = useState('');
  const [shiftNote, setShiftNote] = useState('');
  const [shiftPhysicalCash, setShiftPhysicalCash] = useState('');
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftSummary, setShiftSummary] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isOnline()) {
        const [p, c, cu, s] = await Promise.all([
          supabase.from('products').select('*, category:categories(*)').eq('is_active', true).order('name'),
          supabase.from('categories').select('*').order('name'),
          supabase.from('customers').select('*').order('name'),
          getSettings(),
        ]);
        if (p.error) throw p.error;
        const products = (p.data as Product[]) || [];
        setProducts(products);
        setCategories((c.data as Category[]) || []);
        setCustomers((cu.data as Customer[]) || []);
        setSettings(s);
        await offlineStore.cacheProducts(products);
        await offlineStore.cacheData('categories', (c.data as Category[]) || []);
        await offlineStore.cacheData('customers', (cu.data as Customer[]) || []);
      } else {
        const [products, categories, customers] = await Promise.all([
          offlineStore.getCachedProducts(),
          offlineStore.getCachedData<Category[]>('categories'),
          offlineStore.getCachedData<Customer[]>('customers'),
        ]);
        setProducts(products);
        setCategories(categories || []);
        setCustomers(customers || []);
        setSettings({});
      }
    } catch (e: any) {
      const cached = await offlineStore.getCachedProducts();
      if (cached.length > 0) { setProducts(cached); setError(null); }
      else setError(e.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    cartLoadHolds();
    shiftLoadActive();
    // Only run on mount - load is stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'F2') { e.preventDefault(); if (!activeShift) { setShiftOpenDialog(true); return; } setPayOpen(true); }
      if (e.key === 'F3') { e.preventDefault(); cartHold(user?.id); }
      if (e.key === 'F4') { e.preventDefault(); setHeldOpen(true); }
      if (e.key === 'Escape') { setPayOpen(false); setHeldOpen(false); setReturOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cartHold, activeShift, user?.id]);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase().trim();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.sku || '').toLowerCase().includes(q);
    const matchCat = categoryFilter === 'all' || p.category_id === categoryFilter;
    return matchSearch && matchCat;
  });

  const subtotal = cartItems.reduce((s, i) => s + i.subtotal, 0);
  const totalDiscount = cartDiscount;
  const grandTotal = Math.max(0, subtotal - totalDiscount);
  const change = (payMethod === 'transfer' || payMethod === 'qris' || payMethod === 'ewallet') ? 0 : Math.max(0, Number(paidAmount || 0) - grandTotal);

  const handleBarcode = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const code = (e.target as HTMLInputElement).value.trim();
    if (!code) return;
    const ok = cartAddByBarcode(code, products);
    if (!ok) {
      toast({ title: 'Produk tidak ditemukan', description: `Barcode/SKU: ${code}`, variant: 'destructive' });
    }
    (e.target as HTMLInputElement).value = '';
  };

  const openItemEdit = (id: string) => {
    const item = cartItems.find((i) => i.product_id === id);
    if (!item) return;
    setItemEdit(id);
    setItemDiscount(item.discount);
    setItemDiscountType(item.discountType);
    setItemNote(item.note);
  };

  const saveItemEdit = () => {
    if (itemEdit) {
      cartSetItemDiscount(itemEdit, itemDiscount, itemDiscountType);
      cartSetItemNote(itemEdit, itemNote);
      toast({ title: 'Item diperbarui' });
    }
    setItemEdit(null);
  };

  const doOpenShift = async () => {
    if (!shiftModal || Number(shiftModal) < 0) {
      toast({ title: 'Modal awal wajib diisi', variant: 'destructive' });
      return;
    }
    setShiftSaving(true);
    try {
      await shiftOpenShift(Number(shiftModal), shiftNote);
      toast({ title: 'Shift dibuka', description: `Modal awal ${formatRupiah(Number(shiftModal))}` });
      setShiftOpenDialog(false);
      setShiftModal('');
      setShiftNote('');
    } catch (e: any) {
      toast({ title: 'Gagal membuka shift', description: e.message, variant: 'destructive' });
    } finally {
      setShiftSaving(false);
    }
  };

  const prepareCloseShift = async () => {
    if (!activeShift) return;
    setShiftSaving(true);
    try {
      const { data: sales } = await supabase
        .from('sales')
        .select('total, payment_method')
        .eq('cashier_id', activeShift.cashier_id)
        .gte('created_at', activeShift.opened_at);
      const totalSales = (sales || []).reduce((s, r) => s + Number(r.total || 0), 0);
      const totalCash = (sales || []).filter((r) => r.payment_method === 'tunai').reduce((s, r) => s + Number(r.total || 0), 0);
      const totalQris = (sales || []).filter((r) => r.payment_method === 'qris').reduce((s, r) => s + Number(r.total || 0), 0);
      const totalEwallet = (sales || []).filter((r) => r.payment_method === 'ewallet').reduce((s, r) => s + Number(r.total || 0), 0);
      const totalTransfer = (sales || []).filter((r) => r.payment_method === 'transfer').reduce((s, r) => s + Number(r.total || 0), 0);
      setShiftSummary({
        openingBalance: activeShift.opening_balance,
        totalSales,
        totalCash,
        totalQris,
        totalEwallet,
        totalTransfer,
        expectedCash: activeShift.opening_balance + totalCash,
      });
      setShiftPhysicalCash(String(activeShift.opening_balance + totalCash));
      setShiftCloseDialog(true);
    } catch (e: any) {
      toast({ title: 'Gagal memuat data shift', description: e.message, variant: 'destructive' });
    } finally {
      setShiftSaving(false);
    }
  };

  const doCloseShift = async () => {
    setShiftSaving(true);
    try {
      const result = await shiftCloseShift(Number(shiftPhysicalCash), shiftNote);
      toast({ title: 'Shift ditutup', description: `Selisih kas: ${formatRupiah(Number(result.difference || 0))}` });
      setShiftCloseDialog(false);
      setShiftNote('');
      setShiftPhysicalCash('');
      setShiftSummary(null);
    } catch (e: any) {
      toast({ title: 'Gagal menutup shift', description: e.message, variant: 'destructive' });
    } finally {
      setShiftSaving(false);
    }
  };

  const handleCheckout = async () => {
    if (!activeShift) {
      setShiftOpenDialog(true);
      return;
    }
    if (cartItems.length === 0) return;
    if (payMethod === 'tunai' && Number(paidAmount) < grandTotal) {
      toast({ title: 'Pembayaran kurang', description: 'Nominal tunai kurang dari total', variant: 'destructive' });
      return;
    }
    // validate stock
    for (const item of cartItems) {
      if (item.qty > item.stock) {
        toast({ title: 'Stok tidak cukup', description: `${item.name}: stok ${item.stock}`, variant: 'destructive' });
        return;
      }
    }

    setProcessing(true);
    try {
      const invoiceNo = generateInvoiceNo();
      const paid = (payMethod === 'transfer' || payMethod === 'qris' || payMethod === 'ewallet') ? grandTotal : Number(paidAmount) || grandTotal;

      // insert sale
      const salePayload = {
        invoice_no: invoiceNo,
        invoice_number: invoiceNo,
        customer_id: cartCustomerId,
        customer_name: cartCustomerName || null,
        order_type: cartOrderType,
        table_number: cartTableNumber || null,
        order_note: cartOrderNote || null,
        cashier_id: user?.id,
        subtotal,
        discount: totalDiscount,
        total: grandTotal,
        grand_total: grandTotal,
        paid,
        amount_paid: paid,
        change,
        change_amount: change,
        payment_method: payMethod,
        status: 'selesai',
        note: payNote,
        notes: payNote,
      };

      if (!isOnline()) {
        // Offline: queue the sale for later sync
        await offlineStore.enqueue({ table: 'sales', operation: 'insert', data: salePayload });
        for (const i of cartItems) {
          await offlineStore.enqueue({ table: 'sale_items', operation: 'insert', data: { ...{ sale_invoice_no: invoiceNo, product_id: i.product_id, product_name: i.name, qty: i.qty, quantity: i.qty, cost_price: i.cost_price, sell_price: i.sell_price, price: i.sell_price, discount: i.discountType === 'rp' ? i.discount : (i.qty * i.sell_price * i.discount / 100), subtotal: i.subtotal } } });
          await offlineStore.enqueue({ table: 'stock_movements', operation: 'insert', data: { product_id: i.product_id, type: 'penjualan', qty: -i.qty, reference: invoiceNo, note: `Penjualan ${invoiceNo}`, created_by: user?.id } });
        }
        // update local cached product stock
        const cached = await offlineStore.getCachedProducts();
        const updated = cached.map((p) => { const it = cartItems.find((i) => i.product_id === p.id); return it ? { ...p, stock: p.stock - it.qty } : p; });
        await offlineStore.cacheProducts(updated);
        setProducts(updated);
        await logAudit('Penjualan', 'Tambah', `Penjualan offline ${invoiceNo} - ${formatRupiah(grandTotal)}`);
        toast({ title: 'Transaksi offline tersimpan', description: 'Akan disinkronkan saat online' });
        setPayOpen(false);
        cartClear();
        setProcessing(false);
        return;
      }

      const { data: saleData, error: saleErr } = await supabase
        .from('sales').insert(salePayload).select('*').maybeSingle();
      if (saleErr) throw saleErr;

      // insert sale items
      const itemsPayload = cartItems.map((i) => ({
        sale_id: saleData.id,
        product_id: i.product_id,
        product_name: i.name,
        qty: i.qty,
        quantity: i.qty,
        cost_price: i.cost_price,
        sell_price: i.sell_price,
        price: i.sell_price,
        discount: i.discountType === 'rp' ? i.discount : (i.qty * i.sell_price * i.discount / 100),
        subtotal: i.subtotal,
      }));
      const { error: itemsErr } = await supabase.from('sale_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      // insert payment
      const { error: payErr } = await supabase.from('payments').insert({
        sale_id: saleData.id,
        method: payMethod,
        amount: paid,
        reference_number: payMethod === 'transfer' ? `${bankName} - ${refNumber}` : payMethod === 'ewallet' ? `${ewalletType} - ${refNumber}` : '',
      });
      if (payErr) throw payErr;

      // reduce stock + stock movements
      for (const i of cartItems) {
        await supabase
          .from('products')
          .update({ stock: i.stock - i.qty, updated_at: new Date().toISOString() })
          .eq('id', i.product_id);
        await supabase.from('stock_movements').insert({
          product_id: i.product_id,
          type: 'penjualan',
          qty: -i.qty,
          reference: invoiceNo,
          note: `Penjualan ${invoiceNo}`,
          created_by: user?.id,
        });
      }

      // build receipt data
      const receiptData: ReceiptData = {
        storeName: settings?.store_name || 'KaSandra Store',
        storeAddress: settings?.address || '',
        storePhone: settings?.phone || '',
        footerNote: settings?.footer_note || 'Terima kasih',
        logoUrl: settings?.logo,
        invoiceNo,
        date: new Date(saleData.created_at).toLocaleString('id-ID'),
        cashier: user?.full_name || 'Kasir',
        customer: customers.find((c) => c.id === cartCustomerId)?.name || cartCustomerName || '',
        orderType: cartOrderType,
        tableNumber: cartTableNumber,
        orderNote: cartOrderNote,
        items: cartItems.map((i) => ({
          name: i.name,
          qty: i.qty,
          price: i.sell_price,
          discount: i.discountType === 'rp' ? i.discount : (i.qty * i.sell_price * i.discount / 100),
          subtotal: i.subtotal,
          note: i.note,
        })),
        subtotal,
        discount: totalDiscount,
        grandTotal,
        paymentMethod: payMethod,
        amountPaid: paid,
        changeAmount: change,
      };

      toast({ title: 'Transaksi berhasil', description: invoiceNo });
      cartClear();
      setPaidAmount('');
      setBankName('');
      setRefNumber('');
      setPayNote('');
      setEwalletType('');
      setPayOpen(false);
      setSuccessData(receiptData);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal transaksi', description: e.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const printSuccess = () => {
    if (!successData) return;
    printReceipt(buildReceiptHTML(successData));
  };

  const downloadSuccess = () => {
    if (!successData) return;
    downloadReceiptPDF(successData);
  };

  const sendWhatsappReceipt = async (data: ReceiptData) => {
    const phone = prompt('Masukkan nomor WhatsApp pelanggan (mis. 62812...):');
    if (!phone) return;
    const msg = `Struk ${data.invoiceNo}\n${data.storeName}\n${data.items.map((i: any) => `${i.name} x${i.qty} = ${formatRupiah(i.subtotal)}`).join('\n')}\nTotal: ${formatRupiah(data.grandTotal)}\nTerima kasih!`;
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-send`;
      const resp = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, message: msg, type: 'text' }) });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Gagal');
      toast({ title: 'Struk terkirim via WhatsApp' });
    } catch (e: any) { toast({ title: 'Gagal mengirim WhatsApp', description: e.message, variant: 'destructive' }); }
  };

  const sendEmailReceipt = async (data: ReceiptData) => {
    const email = prompt('Masukkan email pelanggan:');
    if (!email) return;
    const body = `Terima kasih atas pembelian Anda.\n\nInvoice: ${data.invoiceNo}\n${data.storeName}\n${data.items.map((i: any) => `${i.name} x${i.qty} = ${formatRupiah(i.subtotal)}`).join('\n')}\nTotal: ${formatRupiah(data.grandTotal)}`;
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-send`;
      const resp = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: email, subject: `Struk ${data.invoiceNo} - ${data.storeName}`, body }) });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || 'Gagal');
      toast({ title: 'Struk terkirim via Email' });
    } catch (e: any) { toast({ title: 'Gagal mengirim email', description: e.message, variant: 'destructive' }); }
  };

  // retur
  const findRetur = async () => {
    if (!returInvoice) return;
    const { data, error } = await supabase
      .from('sales').select('*, sale_items(*)').eq('invoice_no', returInvoice).maybeSingle();
    if (error || !data) {
      toast({ title: 'Invoice tidak ditemukan', variant: 'destructive' });
      setReturSale(null);
      return;
    }
    setReturSale(data);
    const items = (data.sale_items || []).map((it: any) => ({
      id: it.id,
      product_id: it.product_id,
      product_name: it.product_name,
      qty: Number(it.qty),
      maxQty: Number(it.qty),
      returQty: 0,
    }));
    setReturItems(items);
  };

  const processRetur = async () => {
    if (!returSale) return;
    const selected = returItems.filter((i) => i.returQty > 0);
    if (selected.length === 0) {
      toast({ title: 'Pilih item untuk retur', variant: 'destructive' });
      return;
    }
    setProcessing(true);
    try {
      // create return record
      const { data: retData, error: retErr } = await supabase
        .from('returns').insert({ sale_id: returSale.id, reason: returReason }).select('*').maybeSingle();
      if (retErr) throw retErr;

      // insert return items + restore stock
      for (const it of selected) {
        if (it.returQty > it.maxQty) {
          toast({ title: 'Qty retur melebihi pembelian', description: it.product_name, variant: 'destructive' });
          setProcessing(false);
          return;
        }
        await supabase.from('return_items').insert({
          return_id: retData.id,
          product_id: it.product_id,
          qty: it.returQty,
        });
        // restore stock
        const { data: prod } = await supabase.from('products').select('stock').eq('id', it.product_id).maybeSingle();
        const currentStock = Number(prod?.stock || 0);
        await supabase
          .from('products')
          .update({ stock: currentStock + it.returQty, updated_at: new Date().toISOString() })
          .eq('id', it.product_id);
        await supabase.from('stock_movements').insert({
          product_id: it.product_id,
          type: 'retur',
          qty: it.returQty,
          reference: returSale.invoice_no,
          note: `Retur ${returSale.invoice_no} - ${returReason}`,
          created_by: user?.id,
        });
      }

      // mark sale as retur
      await supabase.from('sales').update({ status: 'retur' }).eq('id', returSale.id);

      toast({ title: 'Retur berhasil' });
      setReturOpen(false);
      setReturSale(null);
      setReturInvoice('');
      setReturReason('');
      setReturItems([]);
      load();
    } catch (e: any) {
      toast({ title: 'Gagal retur', description: e.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const quickCash = [5000, 10000, 20000, 50000, 100000];

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4">
      {/* Left: products */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama / barcode / SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Input
            ref={barcodeRef}
            placeholder="Scan barcode + Enter"
            className="w-44"
            onKeyDown={handleBarcode}
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-thin pb-1">
          <button
            onClick={() => setCategoryFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              categoryFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            )}
          >
            Semua
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                categoryFilter === c.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Package} title="Produk tidak ditemukan" description="Coba kata kunci lain atau ubah filter" />
        ) : (
          <ScrollArea className="flex-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 pr-2 pb-4">
              {filtered.map((p) => {
                const sellPrice = Number(p.selling_price) || Number(p.sell_price) || 0;
                const stock = Number(p.stock);
                return (
                  <button
                    key={p.id}
                    onClick={() => cartAdd(p)}
                    disabled={stock <= 0}
                    className={cn(
                      'group relative flex flex-col items-start p-3 rounded-xl border bg-card text-left transition-all hover:shadow-md hover:border-primary/50',
                      stock <= 0 && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <div className="w-full aspect-square mb-2 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                      {(p.image_url || p.photo_url) ? (
                        <img src={p.image_url || p.photo_url!} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-sm font-medium line-clamp-2 leading-tight mb-1">{p.name}</p>
                    <p className="text-sm font-bold text-primary">{formatRupiah(sellPrice)}</p>
                    <div className="flex items-center justify-between w-full mt-1">
                      <span className="text-xs text-muted-foreground">Stok: {formatNumber(stock)}</span>
                      {stock <= 0 && <Badge variant="destructive" className="text-[10px]">Habis</Badge>}
                      {stock > 0 && stock <= (Number(p.minimum_stock) || Number(p.min_stock) || 0) && <Badge variant="secondary" className="text-[10px]">Menipis</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Right: cart */}
      <div className="w-full lg:w-96 flex flex-col bg-card border rounded-xl overflow-hidden shrink-0">
        <div className="p-4 border-b">
          {/* Shift status indicator */}
          <div className={`flex items-center justify-between gap-2 mb-3 p-2 rounded-lg text-xs ${activeShift ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
            <span className="flex items-center gap-1.5 font-medium">
              {activeShift ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              {activeShift ? `Absensi aktif — ${formatRupiah(Number(activeShift.opening_balance))}` : 'Absensi belum dimulai'}
            </span>
            {activeShift ? (
              <button onClick={prepareCloseShift} className="underline hover:no-underline font-medium" disabled={shiftSaving}>
                Pulang
              </button>
            ) : (
              <button onClick={() => setShiftOpenDialog(true)} className="underline hover:no-underline font-medium">
                Masuk
              </button>
            )}
          </div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Keranjang ({cartItems.length})
            </h3>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setHeldOpen(true)} className="h-8">
                <Pause className="w-3.5 h-3.5" /> Hold ({cartHeldCarts.length})
              </Button>
              <Button variant="outline" size="sm" onClick={() => setReturOpen(true)} className="h-8">
                <RotateCcw className="w-3.5 h-3.5" /> Retur
              </Button>
            </div>
          </div>
          {/* Customer picker */}
          <Select value={cartCustomerId || 'none'} onValueChange={(v) => cartSetCustomer(v === 'none' ? null : v)}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Pilih pelanggan (opsional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Guest</span>
              </SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Customer name for walk-in */}
          {!cartCustomerId && (
            <Input
              placeholder="Nama pelanggan (opsional)"
              value={cartCustomerName}
              onChange={(e) => cartSetCustomerName(e.target.value)}
              className="h-9"
            />
          )}

          {/* Order Type */}
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { value: 'dine_in', label: 'Dine In', icon: Utensils },
              { value: 'take_away', label: 'Take Away', icon: ShoppingBag },
              { value: 'delivery', label: 'Delivery', icon: Bike },
            ] as const).map((opt) => {
              const Icon = opt.icon;
              const active = cartOrderType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => cartSetOrderType(opt.value)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs font-medium transition-colors ${
                    active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Table number (dine-in only) */}
          {cartOrderType === 'dine_in' && (
            <Input
              placeholder="Nomor meja"
              value={cartTableNumber}
              onChange={(e) => cartSetTableNumber(e.target.value)}
              className="h-9"
            />
          )}

          {/* Order note */}
          <div className="relative">
            <StickyNote className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Catatan pesanan..."
              value={cartOrderNote}
              onChange={(e) => cartSetOrderNote(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-2">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ShoppingCart className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm font-medium">Keranjang kosong</p>
                <p className="text-xs">Pilih produk atau scan barcode</p>
              </div>
            ) : (
              cartItems.map((i) => (
                <div key={i.product_id} className="p-2 rounded-lg bg-muted/40">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{i.name}</p>
                      <p className="text-xs text-muted-foreground">{formatRupiah(i.sell_price)} x {i.qty}</p>
                      {(i.discount > 0 || i.note) && (
                        <button onClick={() => openItemEdit(i.product_id)} className="text-xs text-primary hover:underline mt-0.5">
                          {i.discount > 0 && <span className="text-destructive">Disc {i.discountType === 'percent' ? `${i.discount}%` : formatRupiah(i.discount)}</span>}
                          {i.discount > 0 && i.note && ' · '}
                          {i.note && <span>catatan</span>}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => cartUpdateQty(i.product_id, i.qty - 1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <Input
                        className="h-7 w-12 text-center px-1"
                        value={i.qty}
                        onChange={(e) => cartUpdateQty(i.product_id, Number(e.target.value) || 0)}
                      />
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => cartUpdateQty(i.product_id, i.qty + 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="text-right w-20">
                      <p className="text-sm font-semibold">{formatRupiah(i.subtotal)}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cartRemove(i.product_id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t space-y-3">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatRupiah(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Diskon Transaksi</span>
              <Input
                type="number"
                value={cartDiscount || ''}
                onChange={(e) => cartSetDiscount(Number(e.target.value) || 0)}
                className="h-7 w-28 text-right"
                placeholder="0"
              />
            </div>
            <div className="flex justify-between text-lg font-bold pt-1 border-t">
              <span>Grand Total</span>
              <span className="text-primary">{formatRupiah(grandTotal)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => cartHold(user?.id)} disabled={cartItems.length === 0}>
              <Pause className="w-4 h-4" /> Hold
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (!activeShift) { setShiftOpenDialog(true); return; }
                setPaidAmount(String(grandTotal));
                setPayOpen(true);
              }}
              disabled={cartItems.length === 0}
            >
              Bayar (F2)
            </Button>
          </div>
          {cartItems.length > 0 && (
            <Button variant="ghost" size="sm" className="w-full text-destructive" onClick={() => setClearOpen(true)}>
              <Trash2 className="w-3.5 h-3.5" /> Kosongkan Keranjang
            </Button>
          )}
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pembayaran</DialogTitle>
            <DialogDescription>Total tagihan {formatRupiah(grandTotal)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={payMethod === 'tunai' ? 'default' : 'outline'}
                onClick={() => setPayMethod('tunai')}
                className="h-12"
              >
                <Banknote className="w-4 h-4" /> Tunai
              </Button>
              <Button
                variant={payMethod === 'transfer' ? 'default' : 'outline'}
                onClick={() => setPayMethod('transfer')}
                className="h-12"
              >
                <CreditCard className="w-4 h-4" /> Transfer
              </Button>
              <Button
                variant={payMethod === 'qris' ? 'default' : 'outline'}
                onClick={() => setPayMethod('qris')}
                className="h-12"
              >
                <QrCode className="w-4 h-4" /> QRIS
              </Button>
              <Button
                variant={payMethod === 'ewallet' ? 'default' : 'outline'}
                onClick={() => setPayMethod('ewallet')}
                className="h-12"
              >
                <Wallet className="w-4 h-4" /> E-Wallet
              </Button>
            </div>

            {payMethod === 'tunai' && (
              <div>
                <Label className="mb-1.5 block">Nominal Bayar</Label>
                <Input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                  className="text-lg font-semibold h-12"
                  autoFocus
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {quickCash.map((c) => (
                    <Button key={c} variant="outline" size="sm" onClick={() => setPaidAmount(String(c))}>
                      {formatRupiah(c)}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setPaidAmount(String(grandTotal))}>
                    Uang Pas
                  </Button>
                </div>
              </div>
            )}

            {payMethod === 'transfer' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nama Bank</Label>
                  <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="BCA / Mandiri / BNI..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Nomor Referensi</Label>
                  <Input value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder="No. transaksi transfer" />
                </div>
              </div>
            )}

            {payMethod === 'qris' && (
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="w-40 h-40 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30">
                  <QrCode className="w-20 h-20 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground text-center">Scan QRIS untuk membayar <span className="font-semibold text-foreground">{formatRupiah(grandTotal)}</span></p>
                <div className="space-y-1.5 w-full">
                  <Label>Nomor Referensi (opsional)</Label>
                  <Input value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder="No. ref QRIS" />
                </div>
              </div>
            )}

            {payMethod === 'ewallet' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Jenis E-Wallet</Label>
                  <Select value={ewalletType || 'none'} onValueChange={(v) => setEwalletType(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Pilih e-wallet" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Pilih e-wallet</SelectItem>
                      <SelectItem value="GoPay">GoPay</SelectItem>
                      <SelectItem value="OVO">OVO</SelectItem>
                      <SelectItem value="DANA">DANA</SelectItem>
                      <SelectItem value="ShopeePay">ShopeePay</SelectItem>
                      <SelectItem value="LinkAja">LinkAja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Nomor Referensi</Label>
                  <Input value={refNumber} onChange={(e) => setRefNumber(e.target.value)} placeholder="No. ref e-wallet" />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Catatan</Label>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="Catatan transaksi (opsional)" />
            </div>

            <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
              <span className="text-sm">Kembalian</span>
              <span className="text-xl font-bold text-success">{formatRupiah(payMethod === 'transfer' || payMethod === 'qris' || payMethod === 'ewallet' ? 0 : change)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Batal</Button>
            <Button
              onClick={handleCheckout}
              disabled={processing || (payMethod === 'tunai' && Number(paidAmount) < grandTotal)}
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Selesaikan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={!!successData} onOpenChange={(v) => !v && setSuccessData(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-5 h-5" /> Transaksi Berhasil
            </DialogTitle>
          </DialogHeader>
          {successData && (
            <div className="space-y-3">
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </div>
                <p className="text-sm text-muted-foreground">No. Invoice</p>
                <p className="font-bold text-lg">{successData.invoiceNo}</p>
                <p className="text-2xl font-bold mt-2">{formatRupiah(successData.grandTotal)}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={printSuccess}>
                  <Printer className="w-4 h-4" /> Print
                </Button>
                <Button variant="outline" className="flex-1" onClick={downloadSuccess}>
                  <Download className="w-4 h-4" /> PDF
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => sendWhatsappReceipt(successData)}>
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => sendEmailReceipt(successData)}>
                  <Mail className="w-4 h-4" /> Email
                </Button>
              </div>
              <Button className="w-full" onClick={() => setSuccessData(null)}>
                Transaksi Baru
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Held Carts Dialog */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transaksi Ditahan</DialogTitle>
            <DialogDescription>Tekan F3 untuk hold, F4 untuk buka daftar</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {cartHeldCarts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Tidak ada transaksi ditahan</p>
            ) : (
              cartHeldCarts.map((h) => (
                <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-medium text-sm">{h.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.items.length} item - {formatRupiah(h.items.reduce((s, i) => s + i.subtotal, 0) - h.discount)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { cartRecall(h.id); setHeldOpen(false); }}>
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => cartDeleteHeld(h.id)}>
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Retur Dialog */}
      <Dialog open={returOpen} onOpenChange={setReturOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Retur Penjualan</DialogTitle>
            <DialogDescription>Cari transaksi, pilih item dan qty retur</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="INV-20250104-1234"
                value={returInvoice}
                onChange={(e) => setReturInvoice(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && findRetur()}
              />
              <Button variant="outline" onClick={findRetur}>Cari</Button>
            </div>

            {returSale && (
              <>
                <div className="p-3 rounded-lg bg-muted space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-medium">{returSale.invoice_no}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">{formatRupiah(Number(returSale.total))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={returSale.status === 'retur' ? 'destructive' : 'secondary'}>{returSale.status}</Badge></div>
                </div>

                {returSale.status === 'retur' ? (
                  <p className="text-sm text-destructive text-center py-2">Transaksi ini sudah di-retur</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm">Pilih Item & Qty Retur</Label>
                      {returItems.map((it, idx) => (
                        <div key={it.id} className="flex items-center gap-2 p-2 rounded-lg border">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{it.product_name}</p>
                            <p className="text-xs text-muted-foreground">Beli: {it.qty}</p>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            max={it.maxQty}
                            value={it.returQty || ''}
                            onChange={(e) => {
                              const v = Math.min(Number(e.target.value) || 0, it.maxQty);
                              setReturItems(prev => prev.map((x, i) => i === idx ? { ...x, returQty: v } : x));
                            }}
                            className="w-20 h-8 text-center"
                            placeholder="0"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Alasan Retur</Label>
                      <Input value={returReason} onChange={(e) => setReturReason(e.target.value)} placeholder="Rusak / Salah barang / dll" />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReturOpen(false); setReturSale(null); setReturInvoice(''); setReturReason(''); setReturItems([]); }}>Batal</Button>
            <Button onClick={processRetur} disabled={processing || !returSale || returSale.status === 'retur'}>
              {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Proses Retur'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Edit Dialog */}
      <Dialog open={!!itemEdit} onOpenChange={(v) => !v && setItemEdit(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
            <DialogDescription>{cartItems.find((i) => i.product_id === itemEdit)?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Diskon per Item</Label>
              <div className="flex gap-2">
                <Input type="number" value={itemDiscount || ''} onChange={(e) => setItemDiscount(Number(e.target.value) || 0)} placeholder="0" />
                <Select value={itemDiscountType} onValueChange={(v) => setItemDiscountType(v as 'rp' | 'percent')}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rp">Rp</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Catatan Item</Label>
              <Input value={itemNote} onChange={(e) => setItemNote(e.target.value)} placeholder="Catatan untuk item ini" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemEdit(null)}>Batal</Button>
            <Button onClick={saveItemEdit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Cart Confirm */}
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kosongkan Keranjang?</AlertDialogTitle>
            <AlertDialogDescription>Semua item di keranjang akan dihapus.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { cartClear(); setClearOpen(false); }} className={cn(buttonVariants({ variant: 'destructive' }))}>
              Kosongkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Open Shift Dialog */}
      <Dialog open={shiftOpenDialog} onOpenChange={setShiftOpenDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Unlock className="w-5 h-5 text-emerald-500" /> Masuk Absensi</DialogTitle>
            <DialogDescription>Masukkan modal awal kas untuk memulai absensi</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Modal Awal</Label>
              <Input type="number" value={shiftModal} onChange={(e) => setShiftModal(e.target.value)} placeholder="0" className="text-lg font-semibold h-12" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan (opsional)</Label>
              <Input value={shiftNote} onChange={(e) => setShiftNote(e.target.value)} placeholder="Catatan absensi..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftOpenDialog(false)}>Batal</Button>
            <Button onClick={doOpenShift} disabled={shiftSaving || !shiftModal}>
              {shiftSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
              Masuk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Shift Dialog */}
      <Dialog open={shiftCloseDialog} onOpenChange={setShiftCloseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="w-5 h-5 text-amber-500" /> Pulang Absensi</DialogTitle>
            <DialogDescription>Periksa dan tutup absensi Anda</DialogDescription>
          </DialogHeader>
          {shiftSummary && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-2.5 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Modal Awal</p>
                  <p className="font-semibold">{formatRupiah(shiftSummary.openingBalance)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Total Penjualan</p>
                  <p className="font-semibold">{formatRupiah(shiftSummary.totalSales)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Total Cash</p>
                  <p className="font-semibold">{formatRupiah(shiftSummary.totalCash)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Total QRIS</p>
                  <p className="font-semibold">{formatRupiah(shiftSummary.totalQris)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Total E-Wallet</p>
                  <p className="font-semibold">{formatRupiah(shiftSummary.totalEwallet)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Total Transfer</p>
                  <p className="font-semibold">{formatRupiah(shiftSummary.totalTransfer)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-primary/10">
                  <p className="text-xs text-muted-foreground">Kas Diharapkan</p>
                  <p className="font-semibold text-primary">{formatRupiah(shiftSummary.expectedCash)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted">
                  <p className="text-xs text-muted-foreground">Selisih</p>
                  <p className={`font-semibold ${Number(shiftPhysicalCash) - shiftSummary.expectedCash === 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {formatRupiah(Number(shiftPhysicalCash) - shiftSummary.expectedCash)}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Kas Fisik</Label>
                <Input type="number" value={shiftPhysicalCash} onChange={(e) => setShiftPhysicalCash(e.target.value)} className="text-lg font-semibold h-12" />
              </div>
              <div className="space-y-1.5">
                <Label>Catatan (opsional)</Label>
                <Input value={shiftNote} onChange={(e) => setShiftNote(e.target.value)} placeholder="Catatan pulang..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftCloseDialog(false)}>Batal</Button>
            <Button onClick={doCloseShift} disabled={shiftSaving || !shiftPhysicalCash}>
              {shiftSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Pulang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
