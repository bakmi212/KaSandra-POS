import { create } from 'zustand';
import { supabase } from './supabase';
import { useAuthStore } from './auth-store';
import { useBranchStore } from './branch-store';

export interface Shift {
  id: string;
  cashier_id: string | null;
  cashier_name: string | null;
  branch_id: string | null;
  opening_balance: number;
  closing_balance: number | null;
  total_sales: number;
  total_cash: number;
  total_qris: number;
  total_ewallet: number;
  total_transfer: number;
  physical_cash: number | null;
  difference: number | null;
  opening_note: string | null;
  closing_note: string | null;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
}

interface ShiftState {
  activeShift: Shift | null;
  loading: boolean;
  loadActive: () => Promise<void>;
  openShift: (openingBalance: number, note?: string) => Promise<Shift>;
  closeShift: (physicalCash: number, note?: string) => Promise<Shift>;
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  activeShift: null,
  loading: false,

  loadActive: async () => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('cashier_id', user.id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    set({ activeShift: (data as Shift) || null });
  },

  openShift: async (openingBalance, note) => {
    const { user } = useAuthStore.getState();
    const { activeBranch } = useBranchStore.getState();
    if (!user) throw new Error('User tidak ditemukan');

    const { data, error } = await supabase
      .from('shifts')
      .insert({
        cashier_id: user.id,
        cashier_name: user.full_name || user.email,
        branch_id: activeBranch?.id || null,
        opening_balance: openingBalance,
        opening_note: note || null,
        status: 'open',
      })
      .select()
      .single();

    if (error) throw error;
    set({ activeShift: data as Shift });
    return data as Shift;
  },

  closeShift: async (physicalCash, note) => {
    const { activeShift } = get();
    if (!activeShift) throw new Error('Tidak ada shift aktif');

    // Compute totals from sales during this shift
    const { data: sales } = await supabase
      .from('sales')
      .select('total, payment_method')
      .eq('cashier_id', activeShift.cashier_id)
      .gte('created_at', activeShift.opened_at)
      .lte('created_at', new Date().toISOString());

    const totalSales = (sales || []).reduce((s, r) => s + Number(r.total || 0), 0);
    const totalCash = (sales || []).filter((r) => r.payment_method === 'tunai').reduce((s, r) => s + Number(r.total || 0), 0);
    const totalQris = (sales || []).filter((r) => r.payment_method === 'qris').reduce((s, r) => s + Number(r.total || 0), 0);
    const totalEwallet = (sales || []).filter((r) => r.payment_method === 'ewallet').reduce((s, r) => s + Number(r.total || 0), 0);
    const totalTransfer = (sales || []).filter((r) => r.payment_method === 'transfer').reduce((s, r) => s + Number(r.total || 0), 0);

    const expectedCash = activeShift.opening_balance + totalCash;
    const difference = physicalCash - expectedCash;
    const closingBalance = expectedCash;

    const { data, error } = await supabase
      .from('shifts')
      .update({
        closing_balance: closingBalance,
        total_sales: totalSales,
        total_cash: totalCash,
        total_qris: totalQris,
        total_ewallet: totalEwallet,
        total_transfer: totalTransfer,
        physical_cash: physicalCash,
        difference,
        closing_note: note || null,
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', activeShift.id)
      .select()
      .single();

    if (error) throw error;
    set({ activeShift: null });
    return data as Shift;
  },
}));
