// Remote Config Store - Dynamic configuration from License Server
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RemoteConfig {
  // Maintenance
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  maintenanceStartTime: string | null;
  maintenanceEndTime: string | null;

  // Version Control
  minimumVersion: string;
  currentVersion: string;
  forceUpdate: boolean;
  forceUpdateVersion: string | null;
  updateUrl: string | null;

  // Feature Flags
  enablePOS: boolean;
  enableInventory: boolean;
  enableAttendance: boolean;
  enableAccounting: boolean;
  enableCRM: boolean;
  enableCloudBackup: boolean;
  enableMultiDevice: boolean;
  enableOffline: boolean;
  enableExport: boolean;
  enableImport: boolean;
  enableNotification: boolean;
  enableAnalytics: boolean;
  enableAI: boolean;

  // Sync
  refreshIntervalMinutes: number;
  offlineValidityHours: number;
  backgroundSyncEnabled: boolean;

  // Server
  serverTime: string | null;
  lastSyncedAt: string | null;
}

export interface FeatureFlags {
  pos: boolean;
  inventory: boolean;
  attendance: boolean;
  accounting: boolean;
  crm: boolean;
  cloudBackup: boolean;
  multiDevice: boolean;
  offline: boolean;
  export: boolean;
  import: boolean;
  notification: boolean;
  analytics: boolean;
  ai: boolean;
}

interface RemoteConfigState {
  config: RemoteConfig;
  isLoading: boolean;
  error: string | null;

  // Actions
  setConfig: (config: Partial<RemoteConfig>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearConfig: () => void;
  syncConfig: () => Promise<void>;

  // Helpers
  isFeatureEnabled: (feature: keyof FeatureFlags) => boolean;
  isUpdateRequired: (currentVersion: string) => boolean;
  isMaintenance: () => boolean;
}

const DEFAULT_CONFIG: RemoteConfig = {
  maintenanceMode: false,
  maintenanceMessage: null,
  maintenanceStartTime: null,
  maintenanceEndTime: null,
  minimumVersion: '1.0.0',
  currentVersion: '3.0.0',
  forceUpdate: false,
  forceUpdateVersion: null,
  updateUrl: null,
  enablePOS: true,
  enableInventory: true,
  enableAttendance: false,
  enableAccounting: false,
  enableCRM: false,
  enableCloudBackup: false,
  enableMultiDevice: false,
  enableOffline: true,
  enableExport: true,
  enableImport: true,
  enableNotification: true,
  enableAnalytics: false,
  enableAI: false,
  refreshIntervalMinutes: 60,
  offlineValidityHours: 24,
  backgroundSyncEnabled: true,
  serverTime: null,
  lastSyncedAt: null,
};

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license-api`;
const PROJECT_API_KEY = 'ksandra_prod_2026';

function versionToNumber(version: string): number {
  const parts = version.split('.').map(Number);
  return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
}

export const useRemoteConfigStore = create<RemoteConfigState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CONFIG,
      isLoading: false,
      error: null,

      setConfig: (config) => {
        set((state) => ({
          config: { ...state.config, ...config, lastSyncedAt: new Date().toISOString() },
          error: null,
        }));
      },

      setLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      clearConfig: () => set({ config: DEFAULT_CONFIG, error: null }),

      syncConfig: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch(`${API_BASE}/v1/project/config?projectApiKey=${PROJECT_API_KEY}`).then(r => r.json());

          if (res.success && res.config) {
            const cfg = res.config;
            const settings = res.project?.settings || {};

            set({
              config: {
                ...get().config,
                maintenanceMode: cfg.maintenanceMode || false,
                maintenanceMessage: cfg.maintenanceMessage || null,
                minimumVersion: cfg.minimumAppVersion || DEFAULT_CONFIG.minimumVersion,
                forceUpdate: cfg.forceUpdate || false,
                forceUpdateVersion: cfg.forceUpdateVersion || null,
                refreshIntervalMinutes: cfg.refreshIntervalMinutes || DEFAULT_CONFIG.refreshIntervalMinutes,
                offlineValidityHours: cfg.offlineValidityHours || DEFAULT_CONFIG.offlineValidityHours,
                enableOffline: settings.enable_offline !== false,
                enableCloudBackup: settings.enable_cloud_backup || false,
                enableAI: settings.enable_ai || false,
                enableAnalytics: settings.enable_analytics || false,
                serverTime: new Date().toISOString(),
                lastSyncedAt: new Date().toISOString(),
              },
            });
          }
        } catch (e) {
          set({ error: 'Failed to sync remote config' });
        } finally {
          set({ isLoading: false });
        }
      },

      isFeatureEnabled: (feature) => {
        const config = get().config;
        const featureMap: Record<keyof FeatureFlags, boolean> = {
          pos: config.enablePOS,
          inventory: config.enableInventory,
          attendance: config.enableAttendance,
          accounting: config.enableAccounting,
          crm: config.enableCRM,
          cloudBackup: config.enableCloudBackup,
          multiDevice: config.enableMultiDevice,
          offline: config.enableOffline,
          export: config.enableExport,
          import: config.enableImport,
          notification: config.enableNotification,
          analytics: config.enableAnalytics,
          ai: config.enableAI,
        };
        return featureMap[feature] ?? false;
      },

      isUpdateRequired: (currentVersion) => {
        const config = get().config;
        if (!config.forceUpdate) return false;
        const minVersion = config.forceUpdateVersion || config.minimumVersion;
        return versionToNumber(currentVersion) < versionToNumber(minVersion);
      },

      isMaintenance: () => {
        const config = get().config;
        if (!config.maintenanceMode) return false;

        // Check if within maintenance window
        if (config.maintenanceStartTime && config.maintenanceEndTime) {
          const now = new Date();
          const start = new Date(config.maintenanceStartTime);
          const end = new Date(config.maintenanceEndTime);
          return now >= start && now <= end;
        }

        return true;
      },
    }),
    {
      name: 'remote-config-storage',
      partialize: (state) => ({ config: state.config }),
    }
  )
);
