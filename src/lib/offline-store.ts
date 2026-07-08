import { get, set, del, keys } from 'idb-keyval';
import type { Product } from './types';

const CACHE_PREFIX = 'kasandra:cache:';
const QUEUE_KEY = 'kasandra:sync-queue';
const LAST_SYNC_KEY = 'kasandra:last-sync';

export interface QueueItem {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  data: any;
  createdAt: number;
  retries: number;
}

export const offlineStore = {
  // ---- Product cache ----
  async cacheProducts(products: Product[]) {
    await set(`${CACHE_PREFIX}products`, products);
  },
  async getCachedProducts(): Promise<Product[]> {
    return (await get(`${CACHE_PREFIX}products`)) || [];
  },

  // ---- Generic cache ----
  async cacheData(key: string, data: any) {
    await set(`${CACHE_PREFIX}${key}`, data);
  },
  async getCachedData<T>(key: string): Promise<T | null> {
    return (await get(`${CACHE_PREFIX}${key}`)) || null;
  },

  // ---- Sync queue ----
  async enqueue(item: Omit<QueueItem, 'id' | 'createdAt' | 'retries'>) {
    const queue = (await get<QueueItem[]>(QUEUE_KEY)) || [];
    const newItem: QueueItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      retries: 0,
    };
    queue.push(newItem);
    await set(QUEUE_KEY, queue);
    return newItem;
  },

  async getQueue(): Promise<QueueItem[]> {
    return (await get<QueueItem[]>(QUEUE_KEY)) || [];
  },

  async removeFromQueue(id: string) {
    const queue = (await get<QueueItem[]>(QUEUE_KEY)) || [];
    const filtered = queue.filter((q) => q.id !== id);
    await set(QUEUE_KEY, filtered);
  },

  async incrementRetry(id: string) {
    const queue = (await get<QueueItem[]>(QUEUE_KEY)) || [];
    const item = queue.find((q) => q.id === id);
    if (item) {
      item.retries++;
      await set(QUEUE_KEY, queue);
    }
  },

  async clearQueue() {
    await del(QUEUE_KEY);
  },

  // ---- Last sync timestamp ----
  async setLastSync() {
    await set(LAST_SYNC_KEY, new Date().toISOString());
  },
  async getLastSync(): Promise<string | null> {
    return (await get<string>(LAST_SYNC_KEY)) || null;
  },

  // ---- Clear all cache ----
  async clearAll() {
    const allKeys = await keys();
    for (const k of allKeys) {
      if (typeof k === 'string' && k.startsWith('kasandra:')) await del(k);
    }
  },
};

// ---- Online/offline detection ----
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function onOnlineStatusChange(cb: (online: boolean) => void): () => void {
  const handler = () => cb(isOnline());
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
  };
}
