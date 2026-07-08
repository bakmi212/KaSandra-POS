// OwnerIntegrationsPage - Integration settings moved from Settings
import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { logAudit, getSettings, saveSettings } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plug, Save, Webhook, Cloud, Mail, MessageCircle, FileSpreadsheet, Copy, Check } from 'lucide-react';

export default function OwnerIntegrationsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then((s) => {
      setForm(s);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(form);
      await logAudit('Owner', 'Edit', 'Integrasi diperbarui');
      toast({ title: 'Integrasi tersimpan' });
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Integrasi</h2>
        <p className="text-sm text-muted-foreground">Kelola integrasi dengan layanan eksternal</p>
      </div>

      <Tabs defaultValue="api" className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="api"><Plug className="w-4 h-4 mr-1" /> API</TabsTrigger>
          <TabsTrigger value="webhook"><Webhook className="w-4 h-4 mr-1" /> Webhook</TabsTrigger>
          <TabsTrigger value="gdrive"><Cloud className="w-4 h-4 mr-1" /> Google Drive</TabsTrigger>
          <TabsTrigger value="gsheets"><FileSpreadsheet className="w-4 h-4 mr-1" /> Google Sheets</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageCircle className="w-4 h-4 mr-1" /> WhatsApp</TabsTrigger>
          <TabsTrigger value="email"><Mail className="w-4 h-4 mr-1" /> Email</TabsTrigger>
        </TabsList>

        <TabsContent value="api">
          <Card className="border-border/50 max-w-2xl">
            <CardHeader><CardTitle className="text-base">REST API</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Gunakan API key untuk mengakses data Kasandra dari aplikasi lain.</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>API Key</Label>
                  <div className="flex gap-2">
                    <Input value={form.api_key || ''} onChange={(e) => setForm({ ...form, api_key: e.target.value })} placeholder="Masukkan API key" />
                    <Button variant="outline" size="icon" onClick={() => copyToClipboard(form.api_key || '', 'api_key')}>
                      {copied === 'api_key' ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>API Secret</Label>
                  <Input type="password" value={form.api_secret || ''} onChange={(e) => setForm({ ...form, api_secret: e.target.value })} placeholder="Masukkan API secret" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhook">
          <Card className="border-border/50 max-w-2xl">
            <CardHeader><CardTitle className="text-base">Webhook</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Kirim notifikasi otomatis saat ada transaksi atau event tertentu.</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Webhook URL</Label>
                  <Input value={form.webhook_url || ''} onChange={(e) => setForm({ ...form, webhook_url: e.target.value })} placeholder="https://" />
                </div>
                <div className="space-y-1.5">
                  <Label>Webhook Secret</Label>
                  <Input type="password" value={form.webhook_secret || ''} onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })} placeholder="Secret untuk verifikasi" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gdrive">
          <Card className="border-border/50 max-w-2xl">
            <CardHeader><CardTitle className="text-base">Google Drive Backup</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Backup otomatis database ke Google Drive.</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Service Account JSON</Label>
                  <Input value={form.gdrive_service_account || ''} onChange={(e) => setForm({ ...form, gdrive_service_account: e.target.value })} placeholder="Path ke file JSON" />
                </div>
                <div className="space-y-1.5">
                  <Label>Folder ID</Label>
                  <Input value={form.gdrive_folder_id || ''} onChange={(e) => setForm({ ...form, gdrive_folder_id: e.target.value })} placeholder="ID folder Google Drive" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gsheets">
          <Card className="border-border/50 max-w-2xl">
            <CardHeader><CardTitle className="text-base">Google Sheets Sync</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Sinkronkan data penjualan ke Google Sheets.</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Service Account JSON</Label>
                  <Input value={form.gsheets_service_account || ''} onChange={(e) => setForm({ ...form, gsheets_service_account: e.target.value })} placeholder="Path ke file JSON" />
                </div>
                <div className="space-y-1.5">
                  <Label>Spreadsheet ID</Label>
                  <Input value={form.gsheets_spreadsheet_id || ''} onChange={(e) => setForm({ ...form, gsheets_spreadsheet_id: e.target.value })} placeholder="ID Spreadsheet" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp">
          <Card className="border-border/50 max-w-2xl">
            <CardHeader><CardTitle className="text-base">WhatsApp Gateway</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Kirim struk dan notifikasi via WhatsApp.</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>API URL</Label>
                  <Input value={form.whatsapp_api_url || ''} onChange={(e) => setForm({ ...form, whatsapp_api_url: e.target.value })} placeholder="https://api.whatsapp.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>API Key</Label>
                  <Input type="password" value={form.whatsapp_api_key || ''} onChange={(e) => setForm({ ...form, whatsapp_api_key: e.target.value })} placeholder="API Key" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card className="border-border/50 max-w-2xl">
            <CardHeader><CardTitle className="text-base">Email SMTP</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Kirim struk dan laporan via email.</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>SMTP Host</Label>
                  <Input value={form.smtp_host || ''} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>SMTP Port</Label>
                    <Input value={form.smtp_port || '587'} onChange={(e) => setForm({ ...form, smtp_port: e.target.value })} placeholder="587" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>SMTP User</Label>
                    <Input value={form.smtp_user || ''} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} placeholder="user@example.com" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>SMTP Password</Label>
                  <Input type="password" value={form.smtp_password || ''} onChange={(e) => setForm({ ...form, smtp_password: e.target.value })} placeholder="Password" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Button onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan'}</Button>
    </div>
  );
}
