// Branding Store - Dynamic branding from License Server
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BrandingConfig {
  // Application
  applicationName: string;
  applicationLogo: string | null;
  splashScreen: string | null;
  version: string;

  // Colors
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;

  // Theme
  lightTheme: Record<string, string>;
  darkTheme: Record<string, string>;

  // Company
  companyName: string;
  website: string | null;
  supportEmail: string | null;
  supportWhatsapp: string | null;

  // Legal
  privacyPolicy: string | null;
  termsOfService: string | null;

  // Footer
  copyright: string;

  // Server info
  serverUrl: string | null;
  lastSyncedAt: string | null;
}

interface BrandingState {
  branding: BrandingConfig;
  isLoading: boolean;
  error: string | null;

  // Actions
  setBranding: (branding: Partial<BrandingConfig>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearBranding: () => void;
  syncBranding: () => Promise<void>;
}

const DEFAULT_BRANDING: BrandingConfig = {
  applicationName: 'KaSandra POS',
  applicationLogo: null,
  splashScreen: null,
  version: '3.0.0',
  primaryColor: '#3b82f6',
  secondaryColor: '#64748b',
  accentColor: '#f59e0b',
  lightTheme: {},
  darkTheme: {},
  companyName: 'KaSandra',
  website: null,
  supportEmail: null,
  supportWhatsapp: null,
  privacyPolicy: null,
  termsOfService: null,
  copyright: '© 2026 KaSandra. All rights reserved.',
  serverUrl: null,
  lastSyncedAt: null,
};

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license-api`;
const PROJECT_API_KEY = 'ksandra_prod_2026';

export const useBrandingStore = create<BrandingState>()(
  persist(
    (set, get) => ({
      branding: DEFAULT_BRANDING,
      isLoading: false,
      error: null,

      setBranding: (branding) => {
        set((state) => ({
          branding: { ...state.branding, ...branding, lastSyncedAt: new Date().toISOString() },
          error: null,
        }));
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      clearBranding: () => set({ branding: DEFAULT_BRANDING, error: null }),

      syncBranding: async () => {
        set({ isLoading: true, error: null });
        try {
          // Fetch project config
          const res = await fetch(`${API_BASE}/v1/project/config?projectApiKey=${PROJECT_API_KEY}`).then(r => r.json());

          if (res.success) {
            const settings = res.project?.settings || {};
            set({
              branding: {
                ...get().branding,
                applicationName: res.project?.name || DEFAULT_BRANDING.applicationName,
                applicationLogo: settings.logo || null,
                primaryColor: settings.primary_color || DEFAULT_BRANDING.primaryColor,
                secondaryColor: settings.secondary_color || DEFAULT_BRANDING.secondaryColor,
                accentColor: settings.accent_color || DEFAULT_BRANDING.accentColor,
                companyName: settings.company_name || DEFAULT_BRANDING.companyName,
                website: settings.website || null,
                supportEmail: settings.support_email || null,
                supportWhatsapp: settings.support_whatsapp || null,
                privacyPolicy: settings.privacy_policy || null,
                termsOfService: settings.terms_of_service || null,
                copyright: settings.copyright || DEFAULT_BRANDING.copyright,
                lastSyncedAt: new Date().toISOString(),
              },
            });
          }
        } catch (e) {
          set({ error: 'Failed to sync branding' });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'branding-storage',
      partialize: (state) => ({ branding: state.branding }),
    }
  )
);

// Helper hook to get CSS variables from branding
export function useBrandingTheme() {
  const branding = useBrandingStore((s) => s.branding);

  return {
    '--primary': branding.primaryColor,
    '--secondary': branding.secondaryColor,
    '--accent': branding.accentColor,
  } as React.CSSProperties;
}
