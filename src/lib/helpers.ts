// ============================================================
// UTILITY HELPERS — Catering Management Platform
// ============================================================
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// DATE & TIME HELPERS
// ============================================================

export function formatDate(date: Date | string, format: 'short' | 'long' | 'datetime' | 'time' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!isValidDate(d)) return '-';

  const optionsMap: Record<string, Intl.DateTimeFormatOptions> = {
    short: { day: '2-digit', month: '2-digit', year: 'numeric' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
    datetime: { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
    time: { hour: '2-digit', minute: '2-digit' },
  };

  const options = optionsMap[format] || optionsMap.short;
  return d.toLocaleDateString('id-ID', options);
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!isValidDate(d)) return '-';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(date: Date | string): string {
  return formatDate(date, 'datetime');
}

export function isValidDate(d: Date): boolean {
  return d instanceof Date && !isNaN(d.getTime());
}

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

export function daysBetween(date1: Date, date2: Date): number {
  const d1 = startOfDay(new Date(date1));
  const d2 = startOfDay(new Date(date2));
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export function isToday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

export function isTomorrow(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const tomorrow = addDays(new Date(), 1);
  return d.toDateString() === tomorrow.toDateString();
}

export function getRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  if (days < 7) return `${days} hari lalu`;
  return formatDate(d, 'short');
}

// ============================================================
// CURRENCY & NUMBER HELPERS
// ============================================================

export function formatCurrency(amount: number, currency: string = 'IDR'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, decimals: number = 0): string {
  const v = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

export function formatPercent(value: number): string {
  const v = Number.isFinite(value) ? value : 0;
  return `${v.toFixed(1)}%`;
}

export function parseCurrency(str: string): number {
  // Remove currency symbols and thousands separators
  const cleaned = str.replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function calculateTax(amount: number, taxRate: number = 0.11): number {
  return Math.round(amount * taxRate);
}

export function roundToNearest(amount: number, nearest: number = 100): number {
  return Math.round(amount / nearest) * nearest;
}

// ============================================================
// NUMBER GENERATORS
// ============================================================

let orderCounter = 0;
let invoiceCounter = 0;
let deliveryCounter = 0;

export function generateOrderId(): string {
  return uuidv4();
}

export function generateOrderNumber(prefix: string = 'ORD'): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  orderCounter = (orderCounter + 1) % 10000;
  const seq = String(orderCounter).padStart(4, '0');
  return `${prefix}${year}${month}${day}${seq}`;
}

export function generateInvoiceNumber(prefix: string = 'INV'): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  invoiceCounter = (invoiceCounter + 1) % 10000;
  const seq = String(invoiceCounter).padStart(4, '0');
  return `${prefix}${year}${month}${seq}`;
}

export function generateDeliveryNumber(prefix: string = 'DLV'): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  deliveryCounter = (deliveryCounter + 1) % 10000;
  const seq = String(deliveryCounter).padStart(4, '0');
  return `${prefix}${year}${month}${day}${seq}`;
}

export function generateReceiptNumber(): string {
  const date = new Date();
  const timestamp = date.getTime().toString(36).toUpperCase();
  return `RCP${timestamp}`;
}

export function generateRandomCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================================
// UUID GENERATOR
// ============================================================

export function generateUUID(): string {
  return uuidv4();
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^(\+62|62|0)8[1-9][0-9]{6,9}$/;
  return phoneRegex.test(phone.replace(/[\s-]/g, ''));
}

export function isValidIndonesianPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s-]/g, '');
  return /^(\+62|62|0)8[1-9][0-9]{6,9}$/.test(cleaned);
}

export function formatIndonesianPhone(phone: string): string {
  const cleaned = phone.replace(/[\s-]/g, '');
  if (cleaned.startsWith('+62')) return cleaned;
  if (cleaned.startsWith('62')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+62${cleaned.slice(1)}`;
  return cleaned;
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isPositiveNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

// ============================================================
// STRING HELPERS
// ============================================================

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function truncateMiddle(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const start = Math.ceil(maxLength / 2) - 1;
  const end = Math.floor(maxLength / 2) - 1;
  return str.slice(0, start) + '...' + str.slice(-end);
}

// ============================================================
// ARRAY HELPERS
// ============================================================

export function groupBy<T>(array: T[], key: keyof T | ((item: T) => string)): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = typeof key === 'function' ? key(item) : String(item[key]);
    return { ...groups, [groupKey]: [...(groups[groupKey] || []), item] };
  }, {} as Record<string, T[]>);
}

export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter(item => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value as unknown);
    return true;
  });
}

export function sortBy<T>(array: T[], key: keyof T, order: 'asc' | 'desc' = 'asc'): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return order === 'desc' ? -comparison : comparison;
  });
}

// ============================================================
// OBJECT HELPERS
// ============================================================

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) result[key] = obj[key];
  });
  return result;
}

export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
}

// ============================================================
// RETRY HELPER
// ============================================================

export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoff?: boolean;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoff = true } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// DEBOUNCE & THROTTLE
// ============================================================

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ============================================================
// FILE HELPERS
// ============================================================

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2);
}

export function getFileType(filename: string): 'image' | 'document' | 'video' | 'audio' | 'other' {
  const ext = getFileExtension(filename).toLowerCase();
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'];
  const videoExts = ['mp4', 'mov', 'avi', 'mkv'];
  const audioExts = ['mp3', 'wav', 'ogg'];

  if (imageExts.includes(ext)) return 'image';
  if (docExts.includes(ext)) return 'document';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  return 'other';
}

// ============================================================
// ENCRYPTION HELPERS (using Web Crypto API)
// ============================================================

export async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function encodeBase64(str: string): string {
  return btoa(encodeURIComponent(str));
}

export function decodeBase64(str: string): string {
  return decodeURIComponent(atob(str));
}
