// OwnerNotificationsPage - Notification settings moved from Settings
import { useEffect, useState } from 'react';
import '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { logAudit, getSettings, saveSettings } from '@/lib/audit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, Save, Sparkles, Send } from 'lucide-react';

export default function OwnerNotificationsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    getSettings().then((s) => {
      setForm({
        notify_low_stock: s.notify_low_stock ?? 'true',
        notify_out_stock: s.notify_out_stock ?? 'true',
        notify_new_sale: s.notify_new_sale ?? 'false',
        notify_shift_open: s.notify_shift_open ?? 'false',
        notify_shift_close: s.notify_shift_close ?? 'false',
        notify_email_recipients: s.notify_email_recipients || '',
        notify_whatsapp_numbers: s.notify_whatsapp_numbers || '',
        ai_openai_key: s.ai_openai_key || '',
        ai_model: s.ai_model || 'gpt-4o-mini',
      });
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings(form);
      await logAudit('Owner', 'Edit', 'Notifikasi diperbarui');
      toast({ title: 'Notifikasi tersimpan' });
    } catch (e: any) {
      toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Notifikasi</h2>
        <p className="text-sm text-muted-foreground">Atur notifikasi dan AI assistant</p>
      </div>

      <Card className="border-border/50 max-w-2xl">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" /> Notifikasi Email</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Kirim notifikasi email untuk event tertentu.</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Email Penerima (pisahkan dengan koma)</Label>
              <Input value={form.notify_email_recipients || ''} onChange={(e) => setForm({ ...form, notify_email_recipients: e.target.value })} placeholder="admin@store.com, owner@store.com" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 max-w-2xl">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Send className="w-4 h-4" /> Notifikasi WhatsApp</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Kirim notifikasi WhatsApp untuk event tertentu.</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nomor WhatsApp (pisahkan dengan koma)</Label>
              <Input value={form.notify_whatsapp_numbers || ''} onChange={(e) => setForm({ ...form, notify_whatsapp_numbers: e.target.value })} placeholder="62812345678, 62898765432" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 max-w-2xl">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Assistant</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Konfigurasi AI assistant untuk analisis bisnis.</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>OpenAI API Key</Label>
              <Input type="password" value={form.ai_openai_key || ''} onChange={(e) => setForm({ ...form, ai_openai_key: e.target.value })} placeholder="sk-..." />
            </div>
            <div className="space-y-1.5">
              <Label>Model</Label>
              <select
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
                value={form.ai_model || 'gpt-4o-mini'}
                onChange={(e) => setForm({ ...form, ai_model: e.target.value })}
              >
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}><Save className="w-4 h-4" /> {saving ? 'Menyimpan...' : 'Simpan'}</Button>
    </div>
  );
}
