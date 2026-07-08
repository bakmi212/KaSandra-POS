// License Connection Engine — Background service for License Server connection.
// Handles Heartbeat, Health Check, Offline Detection, and Auto-Reconnect.
// Runs automatically after successful registration. Stops after disconnect.
import { setupGlobalErrorHandler } from '@/lib/logger';

// ============================================================
// TYPES
// ============================================================

export type ConnectionStatus =
  | 'Connected'
  | 'Connecting'
  | 'Registering'
  | 'Disconnected'
  | 'Offline'
  | 'Authentication Failed';

export interface ConnectionSettings {
  license_server_url: string;
  project_token: string;
  project_id: string;
  project_code: string;
  project_name: string;
  application_name: string;
  application_version: string;
  platform: string;
  server_name: string;
  server_version: string;
  server_api_version: string;
  connection_status: ConnectionStatus;
  connected_at: string;
  registered_at: string;
  last_health_check: string;
  last_seen: string;
  heartbeat_interval: number;
  last_heartbeat_at: string;
  latency_ms: number;
  created_at: string;
  updated_at: string;
}

export type ActivityType =
  | 'connection_started'
  | 'registration_success'
  | 'registration_failed'
  | 'disconnected'
  | 'reconnect'
  | 'reconnect_success'
  | 'reconnect_failed'
  | 'health_check'
  | 'health_check_failed'
  | 'heartbeat'
  | 'heartbeat_failed'
  | 'offline'
  | 'online'
  | 'authentication_failed'
  | 'timeout'
  | 'server_unreachable';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: string;
}

interface HeartbeatResponse {
  success: boolean;
  connection_status?: string;
  server_version?: string;
  api_version?: string;
  heartbeat_interval?: number;
  server_time?: string;
  message?: string;
}

interface HealthResponse {
  success: boolean;
  status?: string;
  database?: string;
  application_version?: string;
  api_version?: string;
  message?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const STORAGE_KEY = 'license_server_connection_settings';
const ACTIVITY_KEY = 'license_server_activity';

const APP_VERSION = '1.0.0';
const PLATFORM = 'web';
const APP_NAME = 'KaSandra POS';

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds
const HEALTH_CHECK_INTERVAL_MS = 5 * 60_000; // 5 minutes
const CONNECTION_CHECK_INTERVAL_MS = 10_000; // 10 seconds
const REQUEST_TIMEOUT_MS = 15_000;

const OFFLINE_THRESHOLD = 3; // 3 consecutive heartbeat failures
const MAX_RETRIES = 5;
const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000]; // 5s, 10s, 20s, 40s, 60s

// ============================================================
// STATE
// ============================================================

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let connectionCheckTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

let heartbeatInProgress = false;
let healthCheckInProgress = false;
let reconnectInProgress = false;
let consecutiveHeartbeatFailures = 0;
let reconnectAttempts = 0;
let engineRunning = false;

type SettingsListener = (settings: ConnectionSettings) => void;
type ActivityListener = (activity: ActivityEvent[]) => void;

const settingsListeners = new Set<SettingsListener>();
const activityListeners = new Set<ActivityListener>();

// ============================================================
// STORAGE HELPERS
// ============================================================

export function loadSettings(): ConnectionSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSettings(data: ConnectionSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  notifySettingsListeners(data);
}

export function loadActivity(): ActivityEvent[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addActivity(event: Omit<ActivityEvent, 'id' | 'timestamp'>): ActivityEvent[] {
  const activity = loadActivity();
  const newEvent: ActivityEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
  };
  const updated = [newEvent, ...activity].slice(0, 50);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(updated));
  notifyActivityListeners(updated);
  return updated;
}

// ============================================================
// LISTENER MANAGEMENT
// ============================================================

export function subscribeToSettings(listener: SettingsListener): () => void {
  settingsListeners.add(listener);
  const current = loadSettings();
  if (current) listener(current);
  return () => settingsListeners.delete(listener);
}

export function subscribeToActivity(listener: ActivityListener): () => void {
  activityListeners.add(listener);
  listener(loadActivity());
  return () => activityListeners.delete(listener);
}

function notifySettingsListeners(settings: ConnectionSettings) {
  settingsListeners.forEach((l) => l(settings));
}

function notifyActivityListeners(activity: ActivityEvent[]) {
  activityListeners.forEach((l) => l(activity));
}

// ============================================================
// API HELPERS
// ============================================================

type FetchError = Error & { name?: string };

function classifyError(err: FetchError | null, status?: number): { code: string; message: string } {
  if (err?.name === 'AbortError') return { code: 'TIMEOUT', message: 'Request timed out' };
  if (err?.message?.includes('Failed to fetch') || err?.message?.includes('fetch')) {
    return { code: 'NETWORK_ERROR', message: 'Unable to reach License Server' };
  }
  if (status === 401) return { code: 'UNAUTHORIZED', message: 'Authentication Failed — Invalid Project Token' };
  if (status === 403) return { code: 'FORBIDDEN', message: 'Access Denied' };
  if (status === 404) return { code: 'NOT_FOUND', message: 'License Server Not Found' };
  if (status === 408) return { code: 'TIMEOUT', message: 'Request Timeout' };
  if (status === 422) return { code: 'INVALID_DATA', message: 'Invalid Data' };
  if (status && status >= 500) return { code: 'SERVER_ERROR', message: `Internal Server Error (HTTP ${status})` };
  return { code: 'NETWORK_ERROR', message: err?.message || 'Network error' };
}

function buildApiUrl(serverUrl: string, endpoint: string): string {
  const base = serverUrl.replace(/\/+$/, '');
  return `${base}/api/internal/${endpoint}`;
}

async function fetchWithTimeout(url: string, options: RequestInit): Promise<{ res: Response; elapsed: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const elapsed = Date.now() - start;
    clearTimeout(timeout);
    return { res, elapsed };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ============================================================
// COMMUNICATION VALIDATION
// ============================================================

function validateConnection(settings: ConnectionSettings): boolean {
  return !!(
    settings.project_token &&
    settings.license_server_url &&
    settings.project_id &&
    settings.project_code
  );
}

// ============================================================
// HEARTBEAT
// ============================================================

async function performHeartbeat(): Promise<void> {
  if (heartbeatInProgress) return; // Prevent duplicate heartbeat

  const settings = loadSettings();
  if (!settings || !validateConnection(settings)) {
    return;
  }

  if (settings.connection_status === 'Disconnected' || settings.connection_status === 'Authentication Failed') {
    return;
  }

  heartbeatInProgress = true;

  try {
    const { res, elapsed } = await fetchWithTimeout(
      buildApiUrl(settings.license_server_url, 'heartbeat'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.project_token}`,
        },
        body: JSON.stringify({
          project_id: settings.project_id,
          project_code: settings.project_code,
          application_name: APP_NAME,
          application_version: APP_VERSION,
          platform: PLATFORM,
          api_version: 'v1',
          timestamp: new Date().toISOString(),
        }),
      }
    );

    const data: HeartbeatResponse = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      // Success — reset failure counter
      consecutiveHeartbeatFailures = 0;

      const now = new Date().toISOString();
      const updated: ConnectionSettings = {
        ...settings,
        connection_status: 'Connected',
        server_version: data.server_version || settings.server_version,
        server_api_version: data.api_version || settings.server_api_version,
        heartbeat_interval: data.heartbeat_interval || settings.heartbeat_interval || 60,
        last_heartbeat_at: now,
        last_seen: now,
        latency_ms: elapsed,
        updated_at: now,
      };

      saveSettings(updated);
      addActivity({ type: 'heartbeat', message: `Heartbeat OK (${elapsed}ms)` });
    } else {
      // Server rejected — check if auth failure
      if (res.status === 401) {
        handleAuthenticationFailure(data.message || 'Authentication Failed');
      } else {
        handleHeartbeatFailure(data.message || `HTTP ${res.status}`);
      }
    }
  } catch (err) {
    const e = err as FetchError;
    const errorInfo = classifyError(e);
    handleHeartbeatFailure(errorInfo.message);
  } finally {
    heartbeatInProgress = false;
  }
}

function handleHeartbeatFailure(reason: string): void {
  consecutiveHeartbeatFailures++;
  addActivity({
    type: 'heartbeat_failed',
    message: `Heartbeat failed (${consecutiveHeartbeatFailures}/${OFFLINE_THRESHOLD}): ${reason}`,
  });

  if (consecutiveHeartbeatFailures >= OFFLINE_THRESHOLD) {
    markOffline(reason);
  }
}

function handleAuthenticationFailure(reason: string): void {
  const settings = loadSettings();
  if (!settings) return;

  // Stop heartbeat and health check timers on auth failure
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }

  const now = new Date().toISOString();
  saveSettings({
    ...settings,
    connection_status: 'Authentication Failed',
    updated_at: now,
  });

  addActivity({ type: 'authentication_failed', message: reason });
}

function markOffline(reason: string): void {
  const settings = loadSettings();
  if (!settings || settings.connection_status === 'Offline') return;

  const now = new Date().toISOString();
  saveSettings({
    ...settings,
    connection_status: 'Offline',
    updated_at: now,
  });

  addActivity({ type: 'offline', message: `Server offline: ${reason}` });

  // Trigger auto-reconnect
  scheduleReconnect();
}

// ============================================================
// HEALTH CHECK
// ============================================================

async function performHealthCheck(): Promise<void> {
  if (healthCheckInProgress) return; // Prevent duplicate

  const settings = loadSettings();
  if (!settings || !validateConnection(settings)) return;
  if (settings.connection_status === 'Disconnected' || settings.connection_status === 'Authentication Failed') return;

  healthCheckInProgress = true;

  try {
    const { res } = await fetchWithTimeout(
      buildApiUrl(settings.license_server_url, 'health'),
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${settings.project_token}`,
        },
      }
    );

    const data: HealthResponse = await res.json().catch(() => ({}));
    const now = new Date().toISOString();

    if (res.ok && data.success) {
      const updated: ConnectionSettings = {
        ...settings,
        server_version: data.application_version || settings.server_version,
        server_api_version: data.api_version || settings.server_api_version,
        connection_status: 'Connected',
        last_health_check: now,
        last_seen: now,
        updated_at: now,
      };
      saveSettings(updated);
      addActivity({ type: 'health_check', message: `Health OK — ${data.status || 'online'}` });
    } else {
      if (res.status === 401) {
        handleAuthenticationFailure(data.message || 'Authentication Failed');
      } else {
        addActivity({ type: 'health_check_failed', message: `Health check failed: HTTP ${res.status}` });
      }
    }
  } catch (err) {
    const e = err as FetchError;
    const errorInfo = classifyError(e);
    addActivity({ type: 'health_check_failed', message: `Health check failed: ${errorInfo.message}` });
  } finally {
    healthCheckInProgress = false;
  }
}

// ============================================================
// AUTO RECONNECT
// ============================================================

function scheduleReconnect(): void {
  if (reconnectInProgress) return; // Prevent duplicate reconnect
  if (reconnectAttempts >= MAX_RETRIES) {
    addActivity({
      type: 'reconnect_failed',
      message: `Max retries (${MAX_RETRIES}) reached. Manual reconnect required.`,
    });
    return;
  }

  if (reconnectTimer) clearTimeout(reconnectTimer);

  const delay = RETRY_DELAYS_MS[Math.min(reconnectAttempts, RETRY_DELAYS_MS.length - 1)];
  reconnectAttempts++;

  addActivity({
    type: 'reconnect',
    message: `Reconnect attempt ${reconnectAttempts}/${MAX_RETRIES} in ${delay / 1000}s`,
  });

  reconnectTimer = setTimeout(() => {
    void attemptReconnect();
  }, delay);
}

async function attemptReconnect(): Promise<void> {
  if (reconnectInProgress) return;

  const settings = loadSettings();
  if (!settings || !validateConnection(settings)) return;
  if (settings.connection_status === 'Connected') {
    reconnectAttempts = 0;
    return;
  }
  if (settings.connection_status === 'Disconnected' || settings.connection_status === 'Authentication Failed') return;

  reconnectInProgress = true;

  try {
    const { res, elapsed } = await fetchWithTimeout(
      buildApiUrl(settings.license_server_url, 'heartbeat'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.project_token}`,
        },
        body: JSON.stringify({
          project_id: settings.project_id,
          project_code: settings.project_code,
          application_name: APP_NAME,
          application_version: APP_VERSION,
          platform: PLATFORM,
          api_version: 'v1',
          timestamp: new Date().toISOString(),
        }),
      }
    );

    const data: HeartbeatResponse = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      // Reconnect succeeded
      consecutiveHeartbeatFailures = 0;
      reconnectAttempts = 0;

      const now = new Date().toISOString();
      saveSettings({
        ...settings,
        connection_status: 'Connected',
        connected_at: now,
        last_seen: now,
        last_heartbeat_at: now,
        last_health_check: now,
        server_version: data.server_version || settings.server_version,
        server_api_version: data.api_version || settings.server_api_version,
        heartbeat_interval: data.heartbeat_interval || settings.heartbeat_interval || 60,
        latency_ms: elapsed,
        updated_at: now,
      });

      addActivity({ type: 'reconnect_success', message: 'Reconnected successfully' });
      addActivity({ type: 'online', message: 'Back online' });
    } else {
      if (res.status === 401) {
        handleAuthenticationFailure(data.message || 'Authentication Failed');
      } else {
        addActivity({ type: 'reconnect_failed', message: `Reconnect failed: HTTP ${res.status}` });
        scheduleReconnect();
      }
    }
  } catch (err) {
    const e = err as FetchError;
    const errorInfo = classifyError(e);
    addActivity({ type: 'reconnect_failed', message: `Reconnect failed: ${errorInfo.message}` });
    scheduleReconnect();
  } finally {
    reconnectInProgress = false;
  }
}

// ============================================================
// CONNECTION CHECK (lightweight status check)
// ============================================================

async function performConnectionCheck(): Promise<void> {
  const settings = loadSettings();
  if (!settings || !validateConnection(settings)) return;
  if (settings.connection_status === 'Disconnected' || settings.connection_status === 'Authentication Failed') return;

  // If offline, trigger reconnect attempt
  if (settings.connection_status === 'Offline' && !reconnectInProgress && reconnectAttempts < MAX_RETRIES) {
    scheduleReconnect();
  }
}

// ============================================================
// ENGINE CONTROL
// ============================================================

export function startEngine(): void {
  if (engineRunning) return; // Prevent duplicate timers

  const settings = loadSettings();
  if (!settings || !validateConnection(settings)) return;
  if (settings.connection_status !== 'Connected') return;

  engineRunning = true;
  setupGlobalErrorHandler();

  // Start heartbeat timer
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    void performHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  // Start health check timer
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  healthCheckTimer = setInterval(() => {
    void performHealthCheck();
  }, HEALTH_CHECK_INTERVAL_MS);

  // Start connection check timer
  if (connectionCheckTimer) clearInterval(connectionCheckTimer);
  connectionCheckTimer = setInterval(() => {
    void performConnectionCheck();
  }, CONNECTION_CHECK_INTERVAL_MS);

  // Perform an immediate heartbeat
  void performHeartbeat();

  addActivity({ type: 'online', message: 'Connection engine started' });
}

export function stopEngine(): void {
  engineRunning = false;

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  if (connectionCheckTimer) {
    clearInterval(connectionCheckTimer);
    connectionCheckTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Reset state
  heartbeatInProgress = false;
  healthCheckInProgress = false;
  reconnectInProgress = false;
  consecutiveHeartbeatFailures = 0;
  reconnectAttempts = 0;
}

export function isEngineRunning(): boolean {
  return engineRunning;
}

// ============================================================
// DISCONNECT — POST /api/internal/disconnect
// ============================================================

export async function performDisconnect(): Promise<boolean> {
  const settings = loadSettings();
  if (!settings) return false;

  // Stop engine first
  stopEngine();

  // Attempt to notify server
  try {
    const { res } = await fetchWithTimeout(
      buildApiUrl(settings.license_server_url, 'disconnect'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.project_token}`,
        },
        body: JSON.stringify({
          project_id: settings.project_id,
          project_code: settings.project_code,
          timestamp: new Date().toISOString(),
        }),
      }
    );

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      addActivity({ type: 'disconnected', message: 'Disconnected from License Server' });
      return true;
    }

    if (res.status === 401) {
      addActivity({ type: 'disconnected', message: 'Disconnected (server confirmed token invalid)' });
      return true;
    }

    // Even if server fails, we disconnect locally
    addActivity({ type: 'disconnected', message: 'Disconnected locally (server unreachable)' });
    return true;
  } catch (err) {
    // Network error — still disconnect locally
    addActivity({ type: 'disconnected', message: 'Disconnected locally (network error)' });
    return true;
  }
}

// ============================================================
// INITIALIZATION
// ============================================================

export function initConnectionEngine(): void {
  // Auto-start engine if already connected
  const settings = loadSettings();
  if (settings && validateConnection(settings) && settings.connection_status === 'Connected') {
    startEngine();
  }

  // Listen for browser online/offline events
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      addActivity({ type: 'online', message: 'Network back online' });
      const s = loadSettings();
      if (s && validateConnection(s) && s.connection_status === 'Offline') {
        // Reset attempts and try to reconnect immediately
        reconnectAttempts = 0;
        consecutiveHeartbeatFailures = 0;
        void attemptReconnect();
      }
    });

    window.addEventListener('offline', () => {
      addActivity({ type: 'offline', message: 'Network went offline' });
      const s = loadSettings();
      if (s && s.connection_status === 'Connected') {
        saveSettings({
          ...s,
          connection_status: 'Offline',
          updated_at: new Date().toISOString(),
        });
      }
    });
  }
}

// ============================================================
// MANUAL TRIGGERS
// ============================================================

export async function manualHealthCheck(): Promise<boolean> {
  const settings = loadSettings();
  if (!settings || !validateConnection(settings)) return false;

  await performHealthCheck();
  const updated = loadSettings();
  return updated?.connection_status === 'Connected';
}

export async function manualReconnect(): Promise<boolean> {
  const settings = loadSettings();
  if (!settings || !validateConnection(settings)) return false;

  // Reset attempts for manual reconnect
  reconnectAttempts = 0;
  consecutiveHeartbeatFailures = 0;

  await attemptReconnect();
  const updated = loadSettings();
  return updated?.connection_status === 'Connected';
}

export function getEngineStats(): {
  running: boolean;
  consecutiveFailures: number;
  reconnectAttempts: number;
  maxRetries: number;
} {
  return {
    running: engineRunning,
    consecutiveFailures: consecutiveHeartbeatFailures,
    reconnectAttempts: reconnectAttempts,
    maxRetries: MAX_RETRIES,
  };
}
