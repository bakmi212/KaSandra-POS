import { supabase } from './supabase';
import { offlineStore, isOnline, type QueueItem } from './offline-store';
import { logAudit } from './audit';
import type { Product } from './types';

const MAX_RETRIES = 5;

let syncing = false;

export async function syncProducts(): Promise<Product[]> {
  const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name');
  if (error) throw error;
  const products = (data as Product[]) || [];
  await offlineStore.cacheProducts(products);
  return products;
}

export async function processQueue(): Promise<{ synced: number; failed: number }> {
  if (!isOnline()) return { synced: 0, failed: 0 };
  const queue = await offlineStore.getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    if (item.retries >= MAX_RETRIES) {
      await offlineStore.removeFromQueue(item.id);
      failed++;
      continue;
    }
    try {
      await processItem(item);
      await offlineStore.removeFromQueue(item.id);
      synced++;
    } catch (e) {
      await offlineStore.incrementRetry(item.id);
      failed++;
    }
  }

  if (synced > 0) {
    await offlineStore.setLastSync();
    await logAudit('Sync', 'Sync', `${synced} transaksi disinkronkan ke server`);
  }

  return { synced, failed };
}

async function processItem(item: QueueItem): Promise<void> {
  const { table, operation, data } = item;
  if (operation === 'insert') {
    const { error } = await supabase.from(table).insert(data);
    if (error) throw error;
  } else if (operation === 'update') {
    const { id, ...rest } = data;
    const { error } = await supabase.from(table).update(rest).eq('id', id);
    if (error) throw error;
  } else if (operation === 'delete') {
    const { error } = await supabase.from(table).delete().eq('id', data.id);
    if (error) throw error;
  }
}

export async function fullSync(): Promise<{ products: number; queue: { synced: number; failed: number } }> {
  if (syncing || !isOnline()) return { products: 0, queue: { synced: 0, failed: 0 } };
  syncing = true;
  try {
    const products = await syncProducts();
    const queueResult = await processQueue();
    return { products: products.length, queue: queueResult };
  } finally {
    syncing = false;
  }
}

export async function getQueueCount(): Promise<number> {
  const queue = await offlineStore.getQueue();
  return queue.length;
}
