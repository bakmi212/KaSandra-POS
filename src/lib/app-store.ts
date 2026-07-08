// ============================================================
// GLOBAL APP STATE — Catering Management Platform
// Centralized state for: app status, network, theme, active kitchen/branch
// ============================================================
import { create } from 'zustand';
import { supabase } from './supabase';
import type { Kitchen, Branch } from './types';

// ============================================================
// NETWORK STATUS
// ============================================================

export interface NetworkStatus {
  isOnline: boolean;
  lastOnline: Date | null;
  lastOffline: Date | null;
}

// ============================================================
// THEME
// ============================================================

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeState {
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
}

// ============================================================
// APP STATE
// ============================================================

interface AppState {
  // App status
  isReady: boolean;
  isLoading: boolean;
  error: string | null;

  // Network
  network: NetworkStatus;

  // Theme
  theme: ThemeState;

  // Active context
  activeBranch: Branch | null;
  activeKitchen: Kitchen | null;
  branches: Branch[];
  kitchens: Kitchen[];

  // App-wide loading overlay
  globalLoading: boolean;
  globalMessage: string | null;

  // Actions
  initialize: () => Promise<void>;
  setTheme: (mode: ThemeMode) => void;
  setActiveBranch: (branch: Branch | null) => void;
  setActiveKitchen: (kitchen: Kitchen | null) => void;
  loadBranches: () => Promise<void>;
  loadKitchens: (branchId?: string) => Promise<void>;
  setGlobalLoading: (loading: boolean, message?: string) => void;
  updateNetworkStatus: (isOnline: boolean) => void;
}

// ============================================================
// STORE
// ============================================================

export const useAppStore = create<AppState>((set, get) => ({
  isReady: false,
  isLoading: true,
  error: null,

  network: {
    isOnline: navigator.onLine,
    lastOnline: navigator.onLine ? new Date() : null,
    lastOffline: !navigator.onLine ? new Date() : null,
  },

  theme: {
    mode: getStoredTheme(),
    resolvedMode: resolveTheme(getStoredTheme()),
  },

  activeBranch: null,
  activeKitchen: null,
  branches: [],
  kitchens: [],

  globalLoading: false,
  globalMessage: null,

  initialize: async () => {
    set({ isLoading: true, error: null });

    try {
      // Setup network listeners
      const updateNetwork = (isOnline: boolean) => {
        set((state) => ({
          network: {
            isOnline,
            lastOnline: isOnline ? new Date() : state.network.lastOnline,
            lastOffline: !isOnline ? new Date() : state.network.lastOffline,
          },
        }));
      };

      window.addEventListener('online', () => updateNetwork(true));
      window.addEventListener('offline', () => updateNetwork(false));

      // Setup theme listener
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', () => {
        const mode = get().theme.mode;
        set({ theme: { mode, resolvedMode: resolveTheme(mode) } });
      });

      // Apply theme
      applyTheme(get().theme.resolvedMode);

      // Load branches
      await get().loadBranches();

      set({ isReady: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  setTheme: (mode) => {
    const resolvedMode = resolveTheme(mode);
    set({ theme: { mode, resolvedMode } });
    applyTheme(resolvedMode);
    localStorage.setItem('theme', mode);
  },

  setActiveBranch: (branch) => {
    set({ activeBranch: branch, activeKitchen: null });
    if (branch) {
      localStorage.setItem('activeBranchId', branch.id);
      get().loadKitchens(branch.id);
    } else {
      localStorage.removeItem('activeBranchId');
      set({ kitchens: [], activeKitchen: null });
    }
  },

  setActiveKitchen: (kitchen) => {
    set({ activeKitchen: kitchen });
    if (kitchen) {
      localStorage.setItem('activeKitchenId', kitchen.id);
    } else {
      localStorage.removeItem('activeKitchenId');
    }
  },

  loadBranches: async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const branches = (data || []) as Branch[];
      set({ branches });

      // Restore active branch from storage
      const storedBranchId = localStorage.getItem('activeBranchId');
      if (storedBranchId) {
        const activeBranch = branches.find((b) => b.id === storedBranchId) || null;
        set({ activeBranch });
        if (activeBranch) {
          await get().loadKitchens(activeBranch.id);
        }
      } else if (branches.length > 0) {
        set({ activeBranch: branches[0] });
        await get().loadKitchens(branches[0].id);
      }
    } catch (err) {
      console.error('Failed to load branches:', err);
    }
  },

  loadKitchens: async (branchId) => {
    try {
      let query = supabase
        .from('kitchens')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const kitchens = (data || []) as Kitchen[];
      set({ kitchens });

      // Restore active kitchen from storage
      const storedKitchenId = localStorage.getItem('activeKitchenId');
      if (storedKitchenId && kitchens.length > 0) {
        const activeKitchen =
          kitchens.find((k) => k.id === storedKitchenId) || kitchens[0];
        set({ activeKitchen });
      } else if (kitchens.length > 0) {
        set({ activeKitchen: kitchens[0] });
      }
    } catch (err) {
      console.error('Failed to load kitchens:', err);
    }
  },

  setGlobalLoading: (loading, message) => {
    set({ globalLoading: loading, globalMessage: message || null });
  },

  updateNetworkStatus: (isOnline) => {
    set((state) => ({
      network: {
        isOnline,
        lastOnline: isOnline ? new Date() : state.network.lastOnline,
        lastOffline: !isOnline ? new Date() : state.network.lastOffline,
      },
    }));
  },
}));

// ============================================================
// THEME HELPERS
// ============================================================

function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem('theme') as ThemeMode;
  if (stored && ['light', 'dark', 'system'].includes(stored)) {
    return stored;
  }
  return 'system';
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

function applyTheme(mode: 'light' | 'dark'): void {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(mode);

  // Update meta theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute(
      'content',
      mode === 'dark' ? '#0f172a' : '#ffffff'
    );
  }
}

// ============================================================
// SELECTORS
// ============================================================

export function useNetworkStatus(): NetworkStatus {
  return useAppStore((s) => s.network);
}

export function useTheme() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  return { ...theme, setTheme };
}

export function useActiveBranch() {
  const activeBranch = useAppStore((s) => s.activeBranch);
  const branches = useAppStore((s) => s.branches);
  const setActiveBranch = useAppStore((s) => s.setActiveBranch);
  return { activeBranch, branches, setActiveBranch };
}

export function useActiveKitchen() {
  const activeKitchen = useAppStore((s) => s.activeKitchen);
  const kitchens = useAppStore((s) => s.kitchens);
  const setActiveKitchen = useAppStore((s) => s.setActiveKitchen);
  return { activeKitchen, kitchens, setActiveKitchen };
}

export function useGlobalLoading() {
  const globalLoading = useAppStore((s) => s.globalLoading);
  const globalMessage = useAppStore((s) => s.globalMessage);
  const setGlobalLoading = useAppStore((s) => s.setGlobalLoading);
  return { loading: globalLoading, message: globalMessage, set: setGlobalLoading };
}

export function useAppReady() {
  const isReady = useAppStore((s) => s.isReady);
  const isLoading = useAppStore((s) => s.isLoading);
  const error = useAppStore((s) => s.error);
  return { isReady, isLoading, error };
}
