import { supabase } from './supabase';
import { useAuthStore } from './auth-store';

export async function logAudit(module: string, activity: string, description = ''): Promise<void> {
  try {
    const user = useAuthStore.getState().user;
    await supabase.from('audit_logs').insert({
      user_id: user?.id || null,
      user_email: user?.email || null,
      module,
      activity,
      description,
    });
  } catch {
    // silent fail — audit logging should not break user flow
  }
}

export async function getSettings(): Promise<Record<string, string>> {
  const { data } = await supabase.from('system_settings').select('key, value');
  const map: Record<string, string> = {};
  (data || []).forEach((s: any) => { map[s.key] = s.value || ''; });
  return map;
}

export async function saveSettings(settings: Record<string, string>): Promise<void> {
  const updates = Object.entries(settings).map(([key, value]) =>
    supabase.from('system_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  );
  await Promise.all(updates);
}
