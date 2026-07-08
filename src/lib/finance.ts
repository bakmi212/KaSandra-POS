import { supabase } from './supabase';

export async function adjustAccountBalance(accountId: string, delta: number): Promise<number> {
  const { data: acc } = await supabase.from('cash_accounts').select('current_balance').eq('id', accountId).maybeSingle();
  const current = Number(acc?.current_balance || 0);
  const newBalance = current + delta;
  if (newBalance < 0) throw new Error('Saldo kas tidak boleh negatif');
  const { error } = await supabase.from('cash_accounts').update({ current_balance: newBalance }).eq('id', accountId);
  if (error) throw error;
  return newBalance;
}

export function generateReferenceNumber(prefix: string): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${ymd}-${rand}`;
}

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  masuk: 'Kas Masuk',
  keluar: 'Kas Keluar',
  transfer: 'Transfer',
};
