import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const formatRupiah = (n: number): string => {
  const v = Number.isFinite(n) ? n : 0;
  return 'Rp ' + v.toLocaleString('id-ID', { maximumFractionDigits: 0 });
};

export const formatNumber = (n: number): string => {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
};

export const formatDate = (d: string | Date): string => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateShort = (d: string | Date): string => {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};
