// ============================================================
// LOGGER — Catering Management Platform
// ============================================================
import { supabase } from './supabase';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'audit';

export interface LogEntry {
  level: LogLevel;
  module: string;
  action: string;
  message: string;
  data?: Record<string, any>;
  userId?: string;
  error?: Error;
}

interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
  consoleFormat: 'simple' | 'json' | 'pretty';
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  audit: 4,
};

let config: LoggerConfig = {
  minLevel: import.meta.env.DEV ? 'debug' : 'info',
  enableConsole: true,
  enableRemote: true,
  consoleFormat: 'pretty',
};

// ============================================================
// PUBLIC API
// ============================================================

export function configureLogger(newConfig: Partial<LoggerConfig>): void {
  config = { ...config, ...newConfig };
}

export const logger = {
  debug(module: string, action: string, message: string, data?: Record<string, any>): void {
    log({ level: 'debug', module, action, message, data });
  },

  info(module: string, action: string, message: string, data?: Record<string, any>): void {
    log({ level: 'info', module, action, message, data });
  },

  warn(module: string, action: string, message: string, data?: Record<string, any>): void {
    log({ level: 'warn', module, action, message, data });
  },

  error(module: string, action: string, message: string, error?: Error, data?: Record<string, any>): void {
    log({ level: 'error', module, action, message, error, data });
  },

  audit(module: string, action: string, message: string, data?: Record<string, any>): Promise<void> {
    return logAudit(module, action, message, data);
  },

  // Convenience methods
  apiRequest(method: string, endpoint: string, data?: unknown): void {
    log({ level: 'debug', module: 'API', action: method, message: endpoint, data: { endpoint, data } });
  },

  apiResponse(method: string, endpoint: string, status: number, duration: number): void {
    log({ level: status >= 400 ? 'error' : 'debug', module: 'API', action: `${method}_RESP`, message: endpoint, data: { endpoint, status, duration } });
  },

  userAction(module: string, action: string, details: string): void {
    log({ level: 'info', module, action, message: `User action: ${details}` });
  },

  performance(module: string, operation: string, durationMs: number): void {
    const level = durationMs > 1000 ? 'warn' : 'debug';
    log({ level, module, action: 'performance', message: `${operation} took ${durationMs}ms` });
  },

  dbQuery(table: string, operation: string, durationMs: number): void {
    log({ level: 'debug', module: 'Database', action: operation, message: table, data: { table, durationMs } });
  },

  // Export helpers
  getLogs: exportLogs,
  clearLogs: clearLocalLogs,
};

// ============================================================
// INTERNAL
// ============================================================

function log(entry: LogEntry): void {
  if (LOG_LEVELS[entry.level] < LOG_LEVELS[config.minLevel]) return;

  if (config.enableConsole) {
    logToConsole(entry);
  }
}

function logToConsole(entry: LogEntry): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.module}]`;

  if (config.consoleFormat === 'json') {
    console.log(JSON.stringify({ ...entry, timestamp }));
  } else if (config.consoleFormat === 'pretty') {
    const style = getConsoleStyle(entry.level);
    console.log(`%c${prefix}`, style, entry.message, entry.data || '');
    if (entry.error) {
      console.error(entry.error);
    }
  } else {
    console.log(`${prefix} ${entry.message}`, entry.data || '', entry.error || '');
  }
}

function getConsoleStyle(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return 'color: #6b7280';
    case 'info':
      return 'color: #3b82f6';
    case 'warn':
      return 'color: #f59e0b; font-weight: bold';
    case 'error':
      return 'color: #ef4444; font-weight: bold';
    case 'audit':
      return 'color: #8b5cf6';
    default:
      return '';
  }
}

// Audit logs to database
export async function logAudit(
  module: string,
  activity: string,
  description: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('audit_logs').insert({
      user_id: user?.id || null,
      user_email: user?.email || null,
      module,
      activity,
      description,
      ip_address: null, // Cannot get IP from browser
      created_at: new Date().toISOString(),
    });

    if (config.enableConsole) {
      logToConsole({ level: 'audit', module, action: activity, message: description, data: metadata });
    }
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

// ============================================================
// LOG EXPORT
// ============================================================

const LOCAL_LOG_KEY = 'app_logs';

interface StoredLog extends LogEntry {
  timestamp: string;
}

export function saveLocalLog(entry: LogEntry): void {
  try {
    const stored: StoredLog[] = JSON.parse(localStorage.getItem(LOCAL_LOG_KEY) || '[]');
    stored.push({ ...entry, timestamp: new Date().toISOString() });
    // Keep only last 500 logs
    if (stored.length > 500) stored.shift();
    localStorage.setItem(LOCAL_LOG_KEY, JSON.stringify(stored));
  } catch {
    // Ignore storage errors
  }
}

export function getLocalStoredLogs(): StoredLog[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

export async function exportLogs(): Promise<string> {
  const localLogs = getLocalStoredLogs();

  // Try to get audit logs from database
  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);

  const exportData = {
    exportedAt: new Date().toISOString(),
    localLogs,
    auditLogs: auditLogs || [],
  };

  return JSON.stringify(exportData, null, 2);
}

export function clearLocalLogs(): void {
  localStorage.removeItem(LOCAL_LOG_KEY);
}

// Performance measurement helper
export function measurePerformance<T>(module: string, operation: string, fn: () => T | Promise<T>): T | Promise<T> {
  const start = performance.now();

  const result = fn();

  if (result instanceof Promise) {
    return result.finally(() => {
      const duration = performance.now() - start;
      logger.performance(module, operation, duration);
    });
  }

  const duration = performance.now() - start;
  logger.performance(module, operation, duration);
  return result;
}

// Error boundary helper
export function logErrorBoundary(error: Error, componentStack?: string): void {
  logger.error('ErrorBoundary', 'ReactError', error.message, error, {
    componentStack,
    stack: error.stack,
  });

  // Optionally send to error tracking service
}

// Global error handler setup
export function setupGlobalErrorHandler(): void {
  window.onerror = (message, source, lineno, colno, error) => {
    logger.error('Global', 'UnhandledError', String(message), error || undefined, {
      source,
      lineno,
      colno,
    });
  };

  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Global', 'UnhandledPromise', event.reason?.message || 'Unhandled promise rejection', event.reason);
  });
}

// Default export
export default logger;
