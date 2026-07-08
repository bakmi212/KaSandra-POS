import { useEffect, useState, lazy, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { logAudit, getSettings, saveSettings } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Store, Settings as SettingsIcon, Printer, DatabaseBackup,
  Info, Save, Download, Server, Loader2,
} from 'lucide-react';

const LicenseServerTab = lazy(() => import('@/components/LicenseServerTab'));

export default function SettingsPage() {
  return (
    <Tabs defaultValue="profil" className="space-y-4">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="profil"><Store className="w-4 h-4 mr-1" /> Profil Toko</TabsTrigger>
        <TabsTrigger value="preferensi"><SettingsIcon className="w-4 h-4 mr-1" /> Preferensi</TabsTrigger>
        <TabsTrigger value="printer"><Printer className="w-4 h-4 mr-1" /> Printer</TabsTrigger>
        <TabsTrigger value="license"><Server className="w-4 h-4 mr-1" /> License Server</TabsTrigger>
        <TabsTrigger value="backup"><DatabaseBackup className="w-4 h-4 mr-1" /> Backup</TabsTrigger>
        <TabsTrigger value="tentang"><Info className="w-4 h-4 mr-1" /> Tentang</TabsTrigger>
      </TabsList>
      <TabsContent value="profil"><ProfilToko /></TabsContent>
      <TabsContent value="preferensi"><PreferensiSistem /></TabsContent>
      <TabsContent value="printer"><PrinterSettings /></TabsContent>
      <TabsContent value="license">
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        }>
          <LicenseServerTab />
        </Suspense>
      </TabsContent>
      <TabsContent value="backup"><BackupRestore /></TabsContent>
      <TabsContent value="tentang"><TentangAplikasi /></TabsContent>
    </Tabs>
  );
}

// ===================== HELPER =====================
function Field({ label, value, onChange, textarea, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean; type?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {textarea ? (
        <textarea
          className="w-full min-h-[80px] px-3 py-2 rounded-md border border-input bg-background text-sm resize-none"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

// ===================== PROFIL TOKO =====================
function ProfilToko() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setForm(s);
      setLoading(false);
    });
  }, []);

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `logos/store-logo.${ext}`;
      const { error: upErr } = await supabase.storage.from('store-assets').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('store-assets').getPublicUrl(path);
      setForm({ ...form, store_logo_url: urlData.publicUrl });
      toast({ title: 'Logo diunggah' });
    } catch (e: any) {
      toast({ title: 'Gagal mengunggah logo', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(form);
      await logAudit('Pengaturan', 'Edit', 'Profil toko diperbarui');
      toast({ title: 'Pengaturan tersimpan' });
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <Card className="border-border/50 max-w-2xl">
      <CardHeader><CardTitle className="text-base">Profil Toko</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex items-center gap-4">
            {form.store_logo_url ? (
              <img src={form.store_logo_url} alt="Logo" className="w-20 h-20 rounded-lg object-cover border" />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center"><Store className="w-8 h-8 text-muted-foreground" /></div>
            )}
            <div>
              <Input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} disabled={uploading} className="max-w-xs" />
              {uploading && <p className="text-xs text-muted-foreground mt-1">Mengunggah...</p>}
            </div>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nama Toko" value={form.store_name || ''} onChange={(v) => setForm({ ...form, store_name: v })} />
          <Field label="Nama Pemilik" value={form.store_owner || ''} onChange={(v) => setForm({ ...form, store_owner: v })} />
          <Field label="Alamat" value={form.store_address || ''} onChange={(v) => setForm({ ...form, store_address: v })} textarea />
          <Field label="Kota" value={form.store_city || ''} onChange={(v) => setForm({ ...form, store_city: v })} />
          <Field label="Provinsi" value={form.store_province || ''} onChange={(v) => setForm({ ...form, store_province: v })} />
          <Field label="Kode Pos" value={form.store_postal_code || ''} onChange={(v) => setForm({ ...form, store_postal_code: v })} />
          <Field label="Nomor Telepon" value={form.store_phone || ''} onChange={(v) => setForm({ ...form, store_phone: v })} />
          <Field label="Email" value={form.store_email || ''} onChange={(v) => setForm({ ...form, store_email: v })} />
          <Field label="Website" value={form.store_website || ''} onChange={(v) => setForm({ ...form, store_website: v })} />
          <Field label="NPWP (Opsional)" value={form.store_npwp || ''} onChange={(v) => setForm({ ...form, store_npwp: v })} />
        </div>
        <div className="space-y-2 pt-2 border-t">
          <p className="text-sm font-medium">Media Sosial</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Instagram" value={form.store_instagram || ''} onChange={(v) => setForm({ ...form, store_instagram: v })} />
            <Field label="Facebook" value={form.store_facebook || ''} onChange={(v) => setForm({ ...form, store_facebook: v })} />
            <Field label="TikTok" value={form.store_tiktok || ''} onChange={(v) => setForm({ ...form, store_tiktok: v })} />
          </div>
        </div>
        <Field label="Catatan Footer Struk" value={form.receipt_footer || ''} onChange={(v) => setForm({ ...form, receipt_footer: v })} textarea />
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan'}</Button>
      </CardContent>
    </Card>
  );
}

// ===================== PREFERENSI SISTEM =====================
function PreferensiSistem() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    getSettings().then((s) => { setForm(s); setLoading(false); });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(form);
      await logAudit('Pengaturan', 'Edit', 'Preferensi sistem diperbarui');
      toast({ title: 'Preferensi tersimpan' });
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <Card className="border-border/50 max-w-2xl">
      <CardHeader><CardTitle className="text-base">Preferensi Sistem</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Mata Uang</Label>
            <Select value={form.currency || 'IDR'} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="IDR">Rupiah (IDR)</SelectItem><SelectItem value="USD">US Dollar (USD)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Format Tanggal</Label>
            <Select value={form.date_format || 'DD/MM/YYYY'} onValueChange={(v) => setForm({ ...form, date_format: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem><SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem><SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Zona Waktu</Label>
            <Select value={form.timezone || 'Asia/Jakarta'} onValueChange={(v) => setForm({ ...form, timezone: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Asia/Jakarta">WIB (Jakarta)</SelectItem><SelectItem value="Asia/Makassar">WITA (Makassar)</SelectItem><SelectItem value="Asia/Jayapura">WIT (Jayapura)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Bahasa</Label>
            <Select value={form.language || 'id'} onValueChange={(v) => setForm({ ...form, language: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="id">Indonesia</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Tema</Label>
            <Select value={form.theme || 'system'} onValueChange={(v) => setForm({ ...form, theme: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem><SelectItem value="system">System</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Data per Halaman</Label>
            <Select value={form.page_size || '10'} onValueChange={(v) => setForm({ ...form, page_size: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent>
            </Select>
          </div>
          <Field label="Prefix Nomor Invoice" value={form.invoice_prefix || 'INV'} onChange={(v) => setForm({ ...form, invoice_prefix: v })} />
          <Field label="Prefix Nomor Pembelian" value={form.purchase_prefix || 'PO'} onChange={(v) => setForm({ ...form, purchase_prefix: v })} />
          <Field label="Prefix Barcode" value={form.barcode_prefix || 'KSD'} onChange={(v) => setForm({ ...form, barcode_prefix: v })} />
        </div>
        <Button onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan'}</Button>
      </CardContent>
    </Card>
  );
}

// ===================== PRINTER =====================
function PrinterSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    getSettings().then((s) => {
      setForm({
        printer_name: s.printer_name || 'Default',
        printer_paper_size: s.printer_paper_size || '80mm',
        printer_copies: s.printer_copies || '1',
        printer_auto_print: s.printer_auto_print || 'false',
        printer_header: s.printer_header || '',
        printer_footer: s.printer_footer || '',
        receipt_print_logo: s.receipt_print_logo ?? 'true',
        receipt_print_store_name: s.receipt_print_store_name ?? 'true',
        receipt_print_address: s.receipt_print_address ?? 'true',
        receipt_print_phone: s.receipt_print_phone ?? 'true',
        receipt_print_cashier: s.receipt_print_cashier ?? 'true',
        receipt_print_customer: s.receipt_print_customer ?? 'true',
        receipt_print_table: s.receipt_print_table ?? 'true',
        receipt_print_note: s.receipt_print_note ?? 'true',
        receipt_print_payment_method: s.receipt_print_payment_method ?? 'true',
        receipt_print_invoice_no: s.receipt_print_invoice_no ?? 'true',
        receipt_print_datetime: s.receipt_print_datetime ?? 'true',
      });
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(form);
      await logAudit('Pengaturan', 'Edit', 'Pengaturan printer diperbarui');
      toast({ title: 'Pengaturan printer tersimpan' });
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <Card className="border-border/50 max-w-2xl">
      <CardHeader><CardTitle className="text-base">Pengaturan Printer</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nama Printer" value={form.printer_name || ''} onChange={(v) => setForm({ ...form, printer_name: v })} />
          <div className="space-y-1.5"><Label>Ukuran Kertas</Label>
            <Select value={form.printer_paper_size} onValueChange={(v) => setForm({ ...form, printer_paper_size: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="58mm">58mm</SelectItem><SelectItem value="80mm">80mm</SelectItem><SelectItem value="A4">A4</SelectItem></SelectContent>
            </Select>
          </div>
          <Field label="Jumlah Copy" value={form.printer_copies || '1'} onChange={(v) => setForm({ ...form, printer_copies: v })} type="number" />
          <div className="space-y-1.5"><Label>Auto Print</Label>
            <Select value={form.printer_auto_print} onValueChange={(v) => setForm({ ...form, printer_auto_print: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="true">Ya</SelectItem><SelectItem value="false">Tidak</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <Field label="Header Struk" value={form.printer_header || ''} onChange={(v) => setForm({ ...form, printer_header: v })} textarea />
        <Field label="Footer Struk" value={form.printer_footer || ''} onChange={(v) => setForm({ ...form, printer_footer: v })} textarea />

        <div className="space-y-3 pt-2 border-t">
          <p className="text-sm font-medium">Cetak di Struk</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'receipt_print_logo', label: 'Cetak Logo' },
              { key: 'receipt_print_store_name', label: 'Cetak Nama Toko' },
              { key: 'receipt_print_address', label: 'Cetak Alamat' },
              { key: 'receipt_print_phone', label: 'Cetak Nomor HP' },
              { key: 'receipt_print_cashier', label: 'Cetak Nama Kasir' },
              { key: 'receipt_print_customer', label: 'Cetak Nama Pelanggan' },
              { key: 'receipt_print_table', label: 'Cetak Nomor Meja' },
              { key: 'receipt_print_note', label: 'Cetak Catatan' },
              { key: 'receipt_print_payment_method', label: 'Cetak Metode Pembayaran' },
              { key: 'receipt_print_invoice_no', label: 'Cetak Nomor Transaksi' },
              { key: 'receipt_print_datetime', label: 'Cetak Tanggal & Jam' },
            ].map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[opt.key] === 'true'}
                  onChange={(e) => setForm({ ...form, [opt.key]: e.target.checked ? 'true' : 'false' })}
                  className="w-4 h-4 rounded border-input"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <Button onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan'}</Button>
      </CardContent>
    </Card>
  );
}

// ===================== BACKUP & RESTORE =====================
function BackupRestore() {
  const { toast } = useToast();
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastBackup, setLastBackup] = useState('');

  useEffect(() => {
    getSettings().then((s) => setLastBackup(s.last_backup || ''));
  }, []);

  const doBackup = async () => {
    setBacking(true);
    try {
      const tables = ['products', 'categories', 'suppliers', 'customers', 'sales', 'sale_items', 'purchases', 'purchase_items', 'stock_movements', 'cash_accounts', 'finance_categories', 'cash_transactions', 'cash_transfers', 'system_settings'];
      const backup: Record<string, any> = { _meta: { version: '1.0', timestamp: new Date().toISOString() } };
      for (const t of tables) {
        const { data } = await supabase.from(t).select('*');
        backup[t] = data || [];
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kasandra-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const now = new Date().toISOString();
      await saveSettings({ last_backup: now });
      setLastBackup(now);
      await logAudit('Pengaturan', 'Backup', 'Backup database diunduh');
      toast({ title: 'Backup berhasil', description: `${tables.length} tabel diekspor` });
    } catch (e: any) {
      toast({ title: 'Gagal backup', description: e.message, variant: 'destructive' });
    } finally {
      setBacking(false);
    }
  };

  const doRestore = async (file: File) => {
    setRestoring(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      const tables = Object.keys(backup).filter((k) => !k.startsWith('_'));
      for (const t of tables) {
        if (Array.isArray(backup[t]) && backup[t].length > 0) {
          const rows = backup[t].map((r: any) => { const { id, ...rest } = r; return rest; });
          await supabase.from(t).upsert(rows);
        }
      }
      await logAudit('Pengaturan', 'Restore', `Restore dari ${tables.length} tabel`);
      toast({ title: 'Restore berhasil', description: `${tables.length} tabel dipulihkan` });
    } catch (e: any) {
      toast({ title: 'Gagal restore', description: e.message, variant: 'destructive' });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Backup Database</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Ekspor seluruh data aplikasi dalam format JSON. Termasuk produk, kategori, supplier, pelanggan, penjualan, pembelian, stok, keuangan, dan pengaturan.</p>
          {lastBackup && <p className="text-xs text-muted-foreground">Backup terakhir: {new Date(lastBackup).toLocaleString('id-ID')}</p>}
          <Button onClick={doBackup} disabled={backing}><Download className="w-4 h-4" /> {backing ? 'Memproses...' : 'Backup Sekarang'}</Button>
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader><CardTitle className="text-base">Restore Database</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Pulihkan data dari file backup JSON. Data yang ada akan ditimpa.</p>
          <Input type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f) doRestore(f); }} disabled={restoring} />
          {restoring && <p className="text-xs text-muted-foreground">Memulihkan data...</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// ===================== TENTANG APLIKASI =====================
function TentangAplikasi() {
  return (
    <Card className="border-border/50 max-w-2xl">
      <CardHeader><CardTitle className="text-base">Tentang KaSandra</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center">
            <Store className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold">KaSandra POS</h3>
            <p className="text-sm text-muted-foreground">Point of Sale System</p>
          </div>
        </div>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Versi</span><span className="font-medium">1.0.0</span></div>
          <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Developer</span><span className="font-medium">KaSandra Team</span></div>
          <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">Framework</span><span className="font-medium">React + Supabase</span></div>
          <div className="flex justify-between py-2"><span className="text-muted-foreground">License</span><span className="font-medium">Proprietary</span></div>
        </div>
        <p className="text-xs text-muted-foreground">
          KaSandra POS adalah sistem point of sale modern untuk restoran, cafe, dan retail.
          Dilengkapi dengan fitur manajemen stok, multi-cabang, laporan keuangan, dan AI assistant.
        </p>
      </CardContent>
    </Card>
  );
}
