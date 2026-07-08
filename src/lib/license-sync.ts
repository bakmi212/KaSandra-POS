// License Sync Engine - Background synchronization for license, branding, config
import { useBrandingStore } from '@/lib/branding-store';
import { useRemoteConfigStore } from '@/lib/remote-config-store';
import { updateMenusFromPermissions } from '@/lib/menu-store';
import {
  licenseClient,
  getStoredLicenseKey,
  setStoredLicenseKey,
  type LicenseResponse,
} from '@/lib/license-client';

const SYNC_INTERVAL_KEY = 'license_sync_interval';
const LAST_SYNC_KEY = 'license_last_sync';
const SYNC_INTERVAL_DEFAULT = 60 * 60 * 1000; // 1 hour

export interface SyncStatus {
  lastSync: string | null;
  nextSync: string | null;
  isOnline: boolean;
  error: string | null;
}

interface SyncOptions {
  force?: boolean;
  silent?: boolean;
}

// Check if sync is needed
function shouldSync(): boolean {
  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  if (!lastSync) return true;

  const interval = parseInt(localStorage.getItem(SYNC_INTERVAL_KEY) || String(SYNC_INTERVAL_DEFAULT));
  const now = Date.now();
  const last = new Date(lastSync).getTime();

  return now - last > interval;
}

// Get sync status
export function getSyncStatus(): SyncStatus {
  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  const interval = parseInt(localStorage.getItem(SYNC_INTERVAL_KEY) || String(SYNC_INTERVAL_DEFAULT));

  return {
    lastSync,
    nextSync: lastSync ? new Date(new Date(lastSync).getTime() + interval).toISOString() : null,
    isOnline: navigator.onLine,
    error: null,
  };
}

// Main sync function
export async function syncLicenseData(options: SyncOptions = {}): Promise<{
  success: boolean;
  license: LicenseResponse | null;
  error: string | null;
}> {
  const { force = false } = options;

  // Check if sync is needed
  if (!force && !shouldSync()) {
    return { success: true, license: null, error: null };
  }

  // Check if online
  if (!navigator.onLine) {
    return { success: false, license: null, error: 'Offline' };
  }

  try {
    // Sync branding
    await useBrandingStore.getState().syncBranding();

    // Sync remote config
    await useRemoteConfigStore.getState().syncConfig();

    // Sync license if exists
    const storedKey = getStoredLicenseKey();
    let license: LicenseResponse | null = null;

    if (storedKey) {
      const res = await licenseClient.refresh(storedKey);
      if (res.success) {
        license = res;
        setStoredLicenseKey(res.licenseKey);

        // Update menus based on license features
        if (res.features) {
          const menuPermissions = res.features
            .filter((f) => f.type === 'string' && f.key.includes('menu'))
            .map((f) => String(f.value));
          updateMenusFromPermissions(menuPermissions);
        }
      }
    }

    // Update last sync time
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());

    return { success: true, license, error: null };
  } catch (e: any) {
    return { success: false, license: null, error: e.message || 'Sync failed' };
  }
}

// Start background sync
let syncInterval: number | null = null;

export function startBackgroundSync(intervalMs: number = SYNC_INTERVAL_DEFAULT): void {
  stopBackgroundSync();
  localStorage.setItem(SYNC_INTERVAL_KEY, String(intervalMs));

  // Initial sync
  syncLicenseData({ silent: true });

  // Setup interval
  syncInterval = window.setInterval(() => {
    syncLicenseData({ silent: true });
  }, intervalMs);

  // Listen for online event
  window.addEventListener('online', () => {
    syncLicenseData({ force: true, silent: true });
  });
}

export function stopBackgroundSync(): void {
  if (syncInterval !== null) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

// Sync on visibility change (when app becomes visible again)
export function setupVisibilitySync(): () => void {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && shouldSync()) {
      syncLicenseData({ silent: true });
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}

// Setup sync on multiple triggers
export function setupLicenseSync(): () => void {
  const cleanups: (() => void)[] = [];

  // Start background sync
  startBackgroundSync();

  // Setup visibility sync
  cleanups.push(setupVisibilitySync());

  // Setup online sync listener
  const handleOnline = () => {
    syncLicenseData({ force: true, silent: true });
  };

  window.addEventListener('online', handleOnline);
  cleanups.push(() => window.removeEventListener('online', handleOnline));

  // Return cleanup function
  return () => {
    stopBackgroundSync();
    cleanups.forEach((fn) => fn());
  };
}

// Offline license validation
export function validateOfflineLicense(): {
  valid: boolean;
  reason?: string;
  daysRemaining?: number;
} {
  const storedKey = getStoredLicenseKey();
  if (!storedKey) {
    return { valid: false, reason: 'No license found' };
  }

  // Check last sync time
  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  if (!lastSync) {
    return { valid: false, reason: 'Never synced' };
  }

  const config = useRemoteConfigStore.getState().config;
  const offlineValidityHours = config.offlineValidityHours || 24;
  const now = Date.now();
  const last = new Date(lastSync).getTime();
  const hoursSinceSync = (now - last) / (1000 * 60 * 60);

  if (hoursSinceSync > offlineValidityHours) {
    return {
      valid: false,
      reason: `Offline validity exceeded (${Math.round(hoursSinceSync)}h > ${offlineValidityHours}h)`,
    };
  }

  return { valid: true };
}
