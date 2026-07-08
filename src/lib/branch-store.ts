import { create } from 'zustand';
import { supabase } from './supabase';
import { useAuthStore } from './auth-store';
import type { Branch } from './types';

interface BranchState {
  branches: Branch[];
  activeBranch: Branch | null;
  loading: boolean;
  loadBranches: () => Promise<void>;
  setActiveBranch: (branch: Branch | null) => void;
  reset: () => void;
}

export const useBranchStore = create<BranchState>((set) => ({
  branches: [],
  activeBranch: null,
  loading: false,

  loadBranches: async () => {
    const user = useAuthStore.getState().user;
    if (!user) { set({ branches: [], activeBranch: null }); return; }
    set({ loading: true });
    try {
      let branchIds: string[] = [];
      if (user.role === 'admin') {
        const { data: allBranches } = await supabase.from('branches').select('*').eq('is_active', true).order('name');
        const list = (allBranches as Branch[]) || [];
        set({ branches: list, loading: false });
        const saved = localStorage.getItem('kasandra-active-branch');
        const active = saved ? list.find((b) => b.id === saved) : null;
        set({ activeBranch: active || list[0] || null });
        return;
      }
      const { data: bu } = await supabase.from('branch_users').select('branch_id').eq('user_id', user.id);
      branchIds = (bu || []).map((b: any) => b.branch_id);
      if (branchIds.length === 0) {
        const { data: allBranches } = await supabase.from('branches').select('*').eq('is_active', true).order('name');
        const list = (allBranches as Branch[]) || [];
        set({ branches: list, activeBranch: list[0] || null, loading: false });
        return;
      }
      const { data: userBranches } = await supabase.from('branches').select('*').in('id', branchIds).eq('is_active', true).order('name');
      const list = (userBranches as Branch[]) || [];
      set({ branches: list, loading: false });
      const saved = localStorage.getItem('kasandra-active-branch');
      const active = saved ? list.find((b) => b.id === saved) : null;
      set({ activeBranch: active || list[0] || null });
    } catch {
      set({ branches: [], activeBranch: null, loading: false });
    }
  },

  setActiveBranch: (branch) => {
    set({ activeBranch: branch });
    if (branch) localStorage.setItem('kasandra-active-branch', branch.id);
    else localStorage.removeItem('kasandra-active-branch');
  },

  reset: () => {
    set({ branches: [], activeBranch: null, loading: false });
    localStorage.removeItem('kasandra-active-branch');
  },
}));
