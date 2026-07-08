// ============================================================
// STORAGE MANAGER — Catering Management Platform
// Secure local storage, cache management, and file operations
// ============================================================
import { supabase } from './supabase';
import { logger } from './logger';

// ============================================================
// SECURE STORAGE (Encrypted Local Storage)
// ============================================================

const SECURE_PREFIX = 'secure_';

export async function secureSet(key: string, value: unknown): Promise<void> {
  try {
    const jsonValue = JSON.stringify(value);
    // Simple encoding for sensitive data (not full encryption but obfuscation)
    const encoded = btoa(encodeURIComponent(jsonValue));
    localStorage.setItem(SECURE_PREFIX + key, encoded);
  } catch (err) {
    logger.error('Storage', 'secureSet', `Failed to set secure item: ${key}`, err as Error);
  }
}

export async function secureGet<T>(key: string): Promise<T | null> {
  try {
    const encoded = localStorage.getItem(SECURE_PREFIX + key);
    if (!encoded) return null;
    const jsonValue = decodeURIComponent(atob(encoded));
    return JSON.parse(jsonValue) as T;
  } catch {
    return null;
  }
}

export async function secureRemove(key: string): Promise<void> {
  localStorage.removeItem(SECURE_PREFIX + key);
}

export async function secureClear(): Promise<void> {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SECURE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

// ============================================================
// LOCAL STORAGE (Persistent Storage)
// ============================================================

export function localSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    logger.error('Storage', 'localSet', `Failed to set local item: ${key}`, err as Error);
  }
}

export function localGet<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function localRemove(key: string): void {
  localStorage.removeItem(key);
}

export function localClear(): void {
  localStorage.clear();
}

// ============================================================
// CACHE MANAGER (TTL-based Storage)
// ============================================================

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

export const cache = {
  set<T>(key: string, value: T, ttlMs: number = 5 * 60 * 1000): void {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    };
    localSet(`cache_${key}`, entry);
  },

  get<T>(key: string): T | null {
    const entry = localGet<CacheEntry<T> | null>(`cache_${key}`, null);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      localRemove(`cache_${key}`);
      return null;
    }

    return entry.value;
  },

  has(key: string): boolean {
    return cache.get(key) !== null;
  },

  remove(key: string): void {
    localRemove(`cache_${key}`);
  },

  clear(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cache_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  },

  getStats(): { totalItems: number; totalSize: string; expiredItems: number } {
    let totalItems = 0;
    let totalSize = 0;
    let expiredItems = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cache_')) {
        totalItems++;
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += value.length;

          try {
            const entry = JSON.parse(value) as CacheEntry<unknown>;
            if (Date.now() > entry.expiresAt) {
              expiredItems++;
            }
          } catch {
            // ignore
          }
        }
      }
    }

    return {
      totalItems,
      totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
      expiredItems,
    };
  },
};

// ============================================================
// SESSION STORAGE (Temporary Storage)
// ============================================================

export function sessionSet(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    logger.error('Storage', 'sessionSet', `Failed to set session item: ${key}`, err as Error);
  }
}

export function sessionGet<T>(key: string, defaultValue: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function sessionRemove(key: string): void {
  sessionStorage.removeItem(key);
}

export function sessionClear(): void {
  sessionStorage.clear();
}

// ============================================================
// FILE UPLOAD (Supabase Storage)
// ============================================================

export type StorageBucket = 'products' | 'customers' | 'kitchens' | 'documents' | 'backups' | 'temp';

export interface UploadResult {
  path: string;
  publicUrl: string;
  error?: string;
}

export async function uploadFile(
  bucket: StorageBucket,
  path: string,
  file: File | Blob,
  options?: {
    upsert?: boolean;
    cacheControl?: string;
    contentType?: string;
  }
): Promise<UploadResult> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        upsert: options?.upsert ?? false,
        cacheControl: options?.cacheControl ?? '3600',
        contentType: options?.contentType,
      });

    if (error) {
      logger.error('Storage', 'upload', `Failed to upload file to ${bucket}/${path}`, error as Error);
      return { path: '', publicUrl: '', error: error.message };
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

    logger.audit('Storage', 'Upload', `Uploaded ${path} to ${bucket}`);
    return { path: data.path, publicUrl: urlData.publicUrl };
  } catch (err: any) {
    return { path: '', publicUrl: '', error: err.message };
  }
}

export async function uploadMultiple(
  bucket: StorageBucket,
  files: { path: string; file: File | Blob }[]
): Promise<UploadResult[]> {
  return Promise.all(files.map(({ path, file }) => uploadFile(bucket, path, file)));
}

export async function downloadFile(bucket: StorageBucket, path: string): Promise<Blob | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);

    if (error) {
      logger.error('Storage', 'download', `Failed to download ${bucket}/${path}`, error as Error);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function getPublicUrl(bucket: StorageBucket, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteFile(bucket: StorageBucket, paths: string[]): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(bucket).remove(paths);

    if (error) {
      logger.error('Storage', 'delete', `Failed to delete files from ${bucket}`, error as Error);
      return false;
    }

    logger.audit('Storage', 'Delete', `Deleted ${paths.length} files from ${bucket}`);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(
  bucket: StorageBucket,
  folder: string = '',
  options?: {
    limit?: number;
    offset?: number;
    sortBy?: { column: string; order: 'asc' | 'desc' };
  }
): Promise<{ name: string; path: string; size: number; lastModified: string }[]> {
  try {
    const { data, error } = await supabase.storage.from(bucket).list(folder, {
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
      sortBy: options?.sortBy ?? { column: 'created_at', order: 'desc' },
    });

    if (error) {
      logger.error('Storage', 'list', `Failed to list ${bucket}/${folder}`, error as Error);
      return [];
    }

    return (data || []).map((item) => ({
      name: item.name,
      path: `${folder}/${item.name}`.replace(/^\//, ''),
      size: item.metadata?.size ?? 0,
      lastModified: item.created_at,
    }));
  } catch {
    return [];
  }
}

// ============================================================
// FILE HELPERS
// ============================================================

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function compressImage(
  file: File,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number }
): Promise<Blob> {
  const { maxWidth = 1024, maxHeight = 1024, quality = 0.8 } = options || {};

  const img = new Image();
  const dataUrl = await fileToDataUrl(file);

  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = dataUrl;
  });

  let { width, height } = img;

  // Scale down if needed
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx?.drawImage(img, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
  });
}

// ============================================================
// BACKUP & RESTORE
// ============================================================

export async function createBackup(): Promise<string> {
  const data: Record<string, unknown> = {};

  // Collect all localStorage data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && !key.startsWith(SECURE_PREFIX) && !key.startsWith('cache_')) {
      const value = localStorage.getItem(key);
      if (value) {
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value;
        }
      }
    }
  }

  const backup = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    data,
  };

  const jsonBlob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });

  return fileToDataUrl(new File([jsonBlob], 'backup.json'));
}

export async function restoreBackup(backupDataUrl: string): Promise<boolean> {
  try {
    const { data } = JSON.parse(atob(backupDataUrl.split(',')[1]));

    // Clear current data (except secure)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && !key.startsWith(SECURE_PREFIX)) {
        localStorage.removeItem(key);
      }
    }

    // Restore data
    for (const [key, value] of Object.entries(data)) {
      localStorage.setItem(key, JSON.stringify(value));
    }

    logger.audit('Storage', 'Restore', 'Restored data from backup');
    return true;
  } catch (err) {
    logger.error('Storage', 'restore', 'Failed to restore backup', err as Error);
    return false;
  }
}

// ============================================================
// EXPORT DEFAULT
// ============================================================

export default {
  secure: { set: secureSet, get: secureGet, remove: secureRemove, clear: secureClear },
  local: { set: localSet, get: localGet, remove: localRemove, clear: localClear },
  cache,
  session: { set: sessionSet, get: sessionGet, remove: sessionRemove, clear: sessionClear },
  file: {
    upload: uploadFile,
    uploadMultiple,
    download: downloadFile,
    getPublicUrl,
    delete: deleteFile,
    list: listFiles,
    compressImage,
    dataUrlToFile,
    fileToDataUrl,
  },
  backup: { create: createBackup, restore: restoreBackup },
};
