import { create } from 'zustand';
import { supabase } from './supabase';
import { logAudit } from './audit';
import { useBranchStore } from './branch-store';
import type { Profile, Role } from './types';

interface AuthState {
  user: Profile | null;
  loading: boolean;
  error: string | null;
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, fullName: string, role: Role) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  error: null,

  init: async () => {
    set({ loading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        set({ user: profile as Profile | null, loading: false });
        if (profile) useBranchStore.getState().loadBranches();
      } else {
        set({ user: null, loading: false });
        useBranchStore.getState().reset();
      }
    } catch {
      set({ user: null, loading: false });
      useBranchStore.getState().reset();
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          set({ user: profile as Profile | null, loading: false });
        } else {
          set({ user: null, loading: false });
        }
      })();
    });
  },

  signIn: async (email, password) => {
    set({ error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: error.message });
      return false;
    }
    await logAudit('Auth', 'Login', `User ${email} login`);
    return true;
  },

  signUp: async (email, password, fullName, role) => {
    set({ error: null });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    if (error) {
      set({ error: error.message });
      return false;
    }
    if (data.user) {
      // ensure profile row exists (trigger also handles, but be safe)
      await supabase.from('profiles').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        role,
      });
    }
    return true;
  },

  signOut: async () => {
    const user = useAuthStore.getState().user;
    if (user) await logAudit('Auth', 'Logout', `User ${user.email} logout`);
    await supabase.auth.signOut();
    set({ user: null });
    useBranchStore.getState().reset();
  },

  refreshProfile: async () => {
    const u = get().user;
    if (!u) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (data) set({ user: data as Profile });
  },
}));
