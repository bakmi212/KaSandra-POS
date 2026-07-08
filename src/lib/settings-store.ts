// ============================================================
// SETTINGS CENTER — Catering Management Platform
// Centralized configuration management with Supabase persistence
// ============================================================
import { create } from 'zustand';
import { supabase } from './supabase';
import { logAudit } from './logger';
import type { AppConfig } from './types';

// ============================================================
// SETTINGS CATEGORIES
// ============================================================

export type SettingsCategory = 'general' | 'order' | 'delivery' | 'production' | 'notification' | 'application';

export interface SettingsByCategory {
  general: {
    businessName: string;
    businessTagline: string;
    logo: string | null;
    currency: string;
    timezone: string;
    language: string;
    address: string;
    phone: string;
    email: string | null;
  };
  order: {
    minOrderAmount: number;
    orderNumberPrefix: string;
    autoConfirmOrder: boolean;
    leadTimeHours: number;
  };
  delivery: {
    deliveryFeeBase: number;
    deliveryFeePerKm: number;
    maxDeliveryRadiusKm: number;
    deliveryNumberPrefix: string;
  };
  production: {
    kitchenPrepBufferHours: number;
    batchProductionEnabled: boolean;
  };
  notification: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    whatsappEnabled: boolean;
    notifyNewOrder: boolean;
    notifyOrderConfirmed: boolean;
    notifyOrderReady: boolean;
    notifyDeliveryStarted: boolean;
    notifyDeliveryCompleted: boolean;
  };
  application: {
    autoUpdate: boolean;
    backupEnabled: boolean;
    cacheManagementEnabled: boolean;
  };
}

// ============================================================
// DEFAULT SETTINGS
// ============================================================

const defaultSettings: SettingsByCategory = {
  general: {
    businessName: 'KaSandra Catering',
    businessTagline: 'Fresh & Delicious Catering',
    logo: null,
    currency: 'IDR',
    timezone: 'Asia/Jakarta',
    language: 'id',
    address: '',
    phone: '',
    email: null,
  },
  order: {
    minOrderAmount: 100000,
    orderNumberPrefix: 'ORD',
    autoConfirmOrder: false,
    leadTimeHours: 24,
  },
  delivery: {
    deliveryFeeBase: 15000,
    deliveryFeePerKm: 5000,
    maxDeliveryRadiusKm: 25,
    deliveryNumberPrefix: 'DLV',
  },
  production: {
    kitchenPrepBufferHours: 4,
    batchProductionEnabled: true,
  },
  notification: {
    pushEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    notifyNewOrder: true,
    notifyOrderConfirmed: true,
    notifyOrderReady: true,
    notifyDeliveryStarted: true,
    notifyDeliveryCompleted: true,
  },
  application: {
    autoUpdate: true,
    backupEnabled: true,
    cacheManagementEnabled: true,
  },
};

// ============================================================
// SETTINGS STORE
// ============================================================

interface SettingsState {
  settings: SettingsByCategory;
  loading: boolean;
  error: string | null;
  isDirty: boolean;

  // Actions
  load: () => Promise<void>;
  updateCategory: <K extends keyof SettingsByCategory>(
    category: K,
    updates: Partial<SettingsByCategory[K]>
  ) => Promise<void>;
  resetCategory: (category: keyof SettingsByCategory) => Promise<void>;
  resetAll: () => Promise<void>;
  get: <K extends keyof SettingsByCategory>(category: K) => SettingsByCategory[K];
  getValue: <K extends keyof SettingsByCategory, VK extends keyof SettingsByCategory[K]>(
    category: K,
    key: VK
  ) => SettingsByCategory[K][VK];
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...defaultSettings },
  loading: true,
  error: null,
  isDirty: false,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*');

      if (error) throw error;

      const loadedSettings = { ...defaultSettings };

      // Process each setting from database
      for (const setting of (data || [])) {
        const cat = setting.category as keyof typeof defaultSettings;
        const key = setting.key;
        const value = setting.value_json || setting.value;

        if (cat in defaultSettings) {
          const catSettings = loadedSettings[cat] as Record<string, unknown>;
          const defaultValue = (defaultSettings[cat] as Record<string, unknown>)[key];

          if (typeof defaultValue === 'number') {
            catSettings[key] = Number(value);
          } else if (typeof defaultValue === 'boolean') {
            catSettings[key] = value === 'true' || value === true;
          } else {
            catSettings[key] = value;
          }
        }
      }

      set({ settings: loadedSettings, loading: false, isDirty: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  updateCategory: async (category, updates) => {
    const current = get().settings;
    const updated = { ...current, [category]: { ...current[category], ...updates } };
    set({ settings: updated, isDirty: true });

    try {
      // Upsert each setting
      const upserts = Object.entries(updates).map(([key, value]) => {
        const isObject = typeof value === 'object' && value !== null;
        return {
          category,
          key,
          value: isObject ? null : String(value),
          value_json: isObject ? value : null,
          updated_at: new Date().toISOString(),
        };
      });

      for (const upsert of upserts) {
        const { error } = await supabase
          .from('app_settings')
          .upsert(upsert, { onConflict: 'category,key' });

        if (error) throw error;
      }

      await logAudit('Settings', 'Update', `Updated ${category} settings`);
      set({ isDirty: false });
    } catch (err: any) {
      set({ error: err.message });
      // Revert on error
      set({ settings: current, isDirty: false });
      throw err;
    }
  },

  resetCategory: async (category) => {
    await get().updateCategory(category, defaultSettings[category]);
    await logAudit('Settings', 'Reset', `Reset ${category} settings to default`);
  },

  resetAll: async () => {
    set({ settings: { ...defaultSettings }, isDirty: true });

    try {
      const categories = Object.keys(defaultSettings) as (keyof typeof defaultSettings)[];
      for (const category of categories) {
        await get().updateCategory(category, defaultSettings[category]);
      }
      await logAudit('Settings', 'ResetAll', 'Reset all settings to default');
      set({ isDirty: false });
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  get: (category) => get().settings[category],

  getValue: (category, key) => get().settings[category][key],
}));

// ============================================================
// CONFIG HOOKS
// ============================================================

export function useBusinessConfig() {
  const settings = useSettingsStore((s) => s.settings.general);
  const loading = useSettingsStore((s) => s.loading);
  return { ...settings, loading };
}

export function useOrderConfig() {
  const settings = useSettingsStore((s) => s.settings.order);
  const loading = useSettingsStore((s) => s.loading);
  const update = useSettingsStore((s) => s.updateCategory);
  return { ...settings, loading, update: (v: Partial<typeof settings>) => update('order', v) };
}

export function useDeliveryConfig() {
  const settings = useSettingsStore((s) => s.settings.delivery);
  const loading = useSettingsStore((s) => s.loading);
  const update = useSettingsStore((s) => s.updateCategory);
  return { ...settings, loading, update: (v: Partial<typeof settings>) => update('delivery', v) };
}

export function useNotificationConfig() {
  const settings = useSettingsStore((s) => s.settings.notification);
  const loading = useSettingsStore((s) => s.loading);
  const update = useSettingsStore((s) => s.updateCategory);
  return { ...settings, loading, update: (v: Partial<typeof settings>) => update('notification', v) };
}

// ============================================================
// APP CONFIG HELPER
// ============================================================

export function useAppConfig(): AppConfig & { loading: boolean } {
  const settings = useSettingsStore((s) => s.settings);
  const loading = useSettingsStore((s) => s.loading);

  return {
    business: {
      name: settings.general.businessName,
      logo: settings.general.logo,
      currency: settings.general.currency,
      timezone: settings.general.timezone,
      language: settings.general.language,
      address: settings.general.address || '',
      phone: settings.general.phone || '',
      email: settings.general.email || null,
    },
    order: {
      minOrderAmount: settings.order.minOrderAmount,
      orderNumberPrefix: settings.order.orderNumberPrefix,
      autoConfirmOrder: settings.order.autoConfirmOrder,
      leadTimeHours: settings.order.leadTimeHours,
    },
    delivery: {
      deliveryFeeBase: settings.delivery.deliveryFeeBase,
      deliveryFeePerKm: settings.delivery.deliveryFeePerKm,
      maxDeliveryRadiusKm: settings.delivery.maxDeliveryRadiusKm,
      deliveryNumberPrefix: settings.delivery.deliveryNumberPrefix,
    },
    production: {
      kitchenPrepBufferHours: settings.production.kitchenPrepBufferHours,
      batchProductionEnabled: settings.production.batchProductionEnabled,
    },
    notification: {
      pushEnabled: settings.notification.pushEnabled,
      emailEnabled: settings.notification.emailEnabled,
      whatsappEnabled: settings.notification.whatsappEnabled,
      notifyNewOrder: settings.notification.notifyNewOrder,
      notifyOrderConfirmed: settings.notification.notifyOrderConfirmed,
      notifyOrderReady: settings.notification.notifyOrderReady,
      notifyDeliveryStarted: settings.notification.notifyDeliveryStarted,
      notifyDeliveryCompleted: settings.notification.notifyDeliveryCompleted,
    },
    loading,
  };
}

// ============================================================
// INITIALIZE
// ============================================================

// Auto-load on first use
let initialized = false;
export function initializeSettings(): void {
  if (initialized) return;
  initialized = true;
  useSettingsStore.getState().load();
}
