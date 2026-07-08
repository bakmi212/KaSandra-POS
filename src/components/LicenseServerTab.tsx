// License Client — Connection UI powered by the Connection Engine.
// Allows administrators to connect this Client Application to a License Server.
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Server, Key, Eye, EyeOff, Copy, Loader2, CheckCircle2,
  AlertCircle, Activity, Link2, Link2Off, RefreshCw,
  Wifi, WifiOff, Shield, Globe, History, Database, AlertTriangle,
  Heart, Gauge,
} from 'lucide-react';
import {
  type ConnectionSettings, type ConnectionStatus, type ActivityEvent, type ActivityType,
  loadSettings, saveSettings, loadActivity, addActivity,
  subscribeToSettings, subscribeToActivity,
  startEngine, stopEngine, performDisconnect, manualHealthCheck, manualReconnect,
  initConnectionEngine, getEngineStats,
} from '@/lib/license-connection-engine';

// ============================================================
// CONSTANTS
// ============================================================

const APP_VERSION = '1.0.0';
const PLATFORM = 'web';
const APP_NAME = 'KaSandra POS';
const REQUEST_TIMEOUT_MS = 15_000;

// ============================================================
// API HELPERS (for initial connect — not handled by engine)
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

function formatDateTime(iso?: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeAgo(iso?: string): string {
  if (!iso) return 'Never';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

// ============================================================
// STATUS COLORS
// ============================================================

const STATUS_COLORS: Record<ConnectionStatus, { bg: string; text: string; border: string }> = {
  Connected: { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/30' },
  Connecting: { bg: 'bg-blue-500/10', text: 'text-blue-600', border: 'border-blue-500/30' },
  Registering: { bg: 'bg-blue-500/10', text: 'text-blue-600', border: 'border-blue-500/30' },
  Disconnected: { bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-500/30' },
  Offline: { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'border-amber-500/30' },
  'Authentication Failed': { bg: 'bg-red-500/10', text: 'text-red-600', border: 'border-red-500/30' },
};

// ============================================================
// COMPONENT
// ============================================================

export default function LicenseServerTab() {
  const { toast } = useToast();

  // State — synced with engine
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ConnectionSettings | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  // Form state
  const [serverUrl, setServerUrl] = useState('');
  const [projectToken, setProjectToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Action states
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Subscribe to engine updates
  useEffect(() => {
    const unsubSettings = subscribeToSettings((s) => setSettings(s));
    const unsubActivity = subscribeToActivity((a) => setActivity(a));

    const saved = loadSettings();
    if (saved) {
      setSettings(saved);
      setServerUrl(saved.license_server_url);
      setProjectToken(saved.project_token);
    }
    setActivity(loadActivity());
    setLoading(false);

    // Initialize engine (auto-starts if connected)
    initConnectionEngine();

    return () => {
      unsubSettings();
      unsubActivity();
    };
  }, []);

  // Persist helper
  const persist = useCallback((data: ConnectionSettings) => {
    setSettings(data);
    saveSettings(data);
  }, []);

  // ============================================================
  // CONNECT — POST /api/internal/register
  // ============================================================

  const connect = async () => {
    if (!serverUrl.trim()) {
      toast({ title: 'Validation Error', description: 'License Server URL is required', variant: 'destructive' });
      return;
    }
    if (!projectToken.trim()) {
      toast({ title: 'Validation Error', description: 'Project Token is required', variant: 'destructive' });
      return;
    }

    try {
      const url = new URL(serverUrl);
      if (url.protocol !== 'https:') {
        toast({ title: 'Validation Error', description: 'HTTPS only — Server URL must use HTTPS', variant: 'destructive' });
        return;
      }
    } catch {
      toast({ title: 'Validation Error', description: 'Invalid URL format', variant: 'destructive' });
      return;
    }

    if (projectToken.trim().length < 10) {
      toast({ title: 'Validation Error', description: 'Project Token is too short', variant: 'destructive' });
      return;
    }

    setConnecting(true);
    addActivity({ type: 'connection_started', message: 'Connection started' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(buildApiUrl(serverUrl, 'register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectToken.trim()}`,
        },
        body: JSON.stringify({
          application_name: APP_NAME,
          application_version: APP_VERSION,
          api_version: 'v1',
          platform: PLATFORM,
          application_url: window.location.origin,
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success && data.project?.id && data.project?.code && data.server?.name && data.server?.version && data.connection?.status) {
        const now = new Date().toISOString();
        const newSettings: ConnectionSettings = {
          license_server_url: serverUrl.trim(),
          project_token: projectToken.trim(),
          project_id: data.project.id,
          project_code: data.project.code,
          project_name: data.project.name || 'Project',
          application_name: APP_NAME,
          application_version: APP_VERSION,
          platform: PLATFORM,
          server_name: data.server.name,
          server_version: data.server.version,
          server_api_version: data.server.api_version || 'v1',
          connection_status: 'Connected',
          connected_at: data.connection.connected_at || now,
          registered_at: data.connection.registered_at || now,
          last_health_check: now,
          last_seen: now,
          last_heartbeat_at: now,
          latency_ms: 0,
          heartbeat_interval: data.connection.heartbeat_interval || 60,
          created_at: settings?.created_at || now,
          updated_at: now,
        };

        persist(newSettings);
        addActivity({ type: 'registration_success', message: `Registered as ${data.project.code}` });
        toast({ title: 'Connected', description: `Project ${data.project.code} registered successfully` });

        // Start the connection engine
        startEngine();
      } else {
        const errorInfo = classifyError(null, res.status);
        const errorMsg = data.message || errorInfo.message;

        const now = new Date().toISOString();
        const failedSettings: ConnectionSettings = {
          license_server_url: serverUrl.trim(),
          project_token: projectToken.trim(),
          project_id: '',
          project_code: '',
          project_name: '',
          application_name: APP_NAME,
          application_version: APP_VERSION,
          platform: PLATFORM,
          server_name: '',
          server_version: '',
          server_api_version: '',
          connection_status: 'Authentication Failed',
          connected_at: '',
          registered_at: '',
          last_health_check: '',
          last_seen: '',
          last_heartbeat_at: '',
          latency_ms: 0,
          heartbeat_interval: 0,
          created_at: settings?.created_at || now,
          updated_at: now,
        };

        persist(failedSettings);
        addActivity({ type: 'registration_failed', message: errorMsg });
        toast({ title: 'Authentication Failed', description: errorMsg, variant: 'destructive' });
      }
    } catch (err) {
      const e = err as FetchError;
      clearTimeout(timeout);
      const errorInfo = classifyError(e);

      const now = new Date().toISOString();
      const failedSettings: ConnectionSettings = {
        license_server_url: serverUrl.trim(),
        project_token: projectToken.trim(),
        project_id: '',
        project_code: '',
        project_name: '',
        application_name: APP_NAME,
        application_version: APP_VERSION,
        platform: PLATFORM,
        server_name: '',
        server_version: '',
        server_api_version: '',
        connection_status: 'Disconnected',
        connected_at: '',
        registered_at: '',
        last_health_check: '',
        last_seen: '',
        last_heartbeat_at: '',
        latency_ms: 0,
        heartbeat_interval: 0,
        created_at: settings?.created_at || now,
        updated_at: now,
      };

      persist(failedSettings);
      addActivity({ type: 'registration_failed', message: errorInfo.message });
      toast({ title: 'Connection Failed', description: errorInfo.message, variant: 'destructive' });
    } finally {
      setConnecting(false);
    }
  };

  // ============================================================
  // DISCONNECT — uses engine
  // ============================================================

  const disconnect = async () => {
    setDisconnecting(true);

    await performDisconnect();

    if (settings) {
      const now = new Date().toISOString();
      const disconnectedSettings: ConnectionSettings = {
        ...settings,
        connection_status: 'Disconnected',
        connected_at: '',
        registered_at: '',
        last_health_check: '',
        last_seen: '',
        last_heartbeat_at: '',
        server_name: '',
        server_version: '',
        server_api_version: '',
        project_id: '',
        project_code: '',
        project_name: '',
        latency_ms: 0,
        updated_at: now,
      };
      persist(disconnectedSettings);
    }

    stopEngine();
    toast({ title: 'Disconnected', description: 'Connection removed. Project Token preserved.' });
    setDisconnecting(false);
  };

  // ============================================================
  // RECONNECT — uses engine
  // ============================================================

  const reconnect = async () => {
    if (!settings?.license_server_url || !settings?.project_token) {
      toast({ title: 'Cannot Reconnect', description: 'No saved credentials', variant: 'destructive' });
      return;
    }

    setReconnecting(true);
    setServerUrl(settings.license_server_url);
    setProjectToken(settings.project_token);

    addActivity({ type: 'reconnect', message: 'Reconnecting...' });

    const success = await manualReconnect();

    if (success) {
      // Restart engine
      startEngine();
      toast({ title: 'Reconnected', description: 'Connection restored' });
    } else {
      toast({ title: 'Reconnect Failed', description: 'Could not reach server', variant: 'destructive' });
    }

    setReconnecting(false);
  };

  // ============================================================
  // HEALTH CHECK — uses engine
  // ============================================================

  const healthCheck = async () => {
    if (!settings?.license_server_url || !settings?.project_token) return;

    setCheckingHealth(true);
    const success = await manualHealthCheck();

    if (success) {
      toast({ title: 'Health Check Passed', description: 'License Server is responding' });
    } else {
      toast({ title: 'Health Check Failed', description: 'Server not responding', variant: 'destructive' });
    }

    setCheckingHealth(false);
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) {
    return <LoadingSkeleton />;
  }

  const isConnected = settings?.connection_status === 'Connected';
  const isDisconnected = !settings || settings.connection_status === 'Disconnected';
  const isAuthFailed = settings?.connection_status === 'Authentication Failed';
  const isOffline = settings?.connection_status === 'Offline';
  const isBusy = connecting || disconnecting || reconnecting || checkingHealth;
  const canConnect = !!serverUrl.trim() && !!projectToken.trim() && !isBusy;
  const stats = getEngineStats();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Server className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">License Server</h2>
          <p className="text-sm text-muted-foreground">Connect this Client Application to a License Server</p>
        </div>
      </div>

      {/* Connection Card */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-5">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Connection Settings</h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="server-url">License Server URL</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="server-url"
                type="url"
                placeholder="https://license.example.com"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                className="pl-9"
                disabled={isConnected}
              />
            </div>
            <p className="text-xs text-muted-foreground">HTTPS only. No trailing spaces.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-token">Project Token</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="project-token"
                type={showToken ? 'text' : 'password'}
                placeholder="kas_xxxxxxxxxxxxxxxx"
                value={projectToken}
                onChange={(e) => setProjectToken(e.target.value)}
                className="pl-9 pr-20 font-mono text-sm"
                disabled={isConnected}
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    navigator.clipboard.writeText(projectToken);
                    toast({ title: 'Copied' });
                  }}
                  disabled={!projectToken}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Token issued by your License Server administrator. Stored locally, never sent to third parties.
            </p>
          </div>
        </div>

        {(isAuthFailed || isOffline) && settings && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-medium">Connection issue: </span>
                {isAuthFailed
                  ? 'Authentication failed. Check your Project Token.'
                  : `Server is offline or unreachable. Auto-reconnect attempt ${stats.reconnectAttempts}/${stats.maxRetries}.`}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-5 pt-5 border-t">
          {isConnected ? (
            <>
              <Button variant="outline" onClick={healthCheck} disabled={isBusy} size="sm">
                {checkingHealth ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
                Health Check
              </Button>
              <Button variant="outline" size="sm" onClick={disconnect} disabled={isBusy} className="text-destructive border-destructive/30 hover:bg-destructive/5">
                {disconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2Off className="h-4 w-4 mr-2" />}
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <Button onClick={connect} disabled={!canConnect || isBusy} size="sm">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                Connect
              </Button>
              {!isDisconnected && (isAuthFailed || isOffline) && (
                <Button variant="outline" onClick={reconnect} disabled={isBusy} size="sm">
                  {reconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Reconnect
                </Button>
              )}
            </>
          )}
        </div>
      </Card>

      {/* Project Information */}
      {settings && (isConnected || settings.project_name) && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Project Information</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <InfoTile label="Application Name" value={settings.application_name || APP_NAME} />
            <InfoTile label="Project Name" value={settings.project_name || '—'} />
            <InfoTile label="Project ID" value={settings.project_id || '—'} mono />
            <InfoTile label="Project Code" value={settings.project_code || '—'} mono />
            <InfoTile label="Platform" value={settings.platform || PLATFORM} />
            <InfoTile label="Application Version" value={`v${settings.application_version || APP_VERSION}`} />
            <InfoTile label="API Version" value={settings.server_api_version || 'v1'} />
            <InfoTile label="Registered At" value={formatDateTime(settings.registered_at)} />
            <InfoTile label="Connected At" value={formatDateTime(settings.connected_at)} />
          </div>
        </Card>
      )}

      {/* Server Information */}
      {settings && isConnected && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Server Information</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <InfoTile label="Server Name" value={settings.server_name || '—'} />
            <InfoTile label="Server Version" value={settings.server_version || '—'} />
            <InfoTile label="API Version" value={settings.server_api_version || 'v1'} />
            <InfoTile label="Server URL" value={settings.license_server_url} />
          </div>
        </Card>
      )}

      {/* Connection Status */}
      {settings && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wifi className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Connection Status</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border">
              <p className="text-xs text-muted-foreground mb-1">Status</p>
              <StatusBadge status={settings.connection_status} />
            </div>
            <InfoTile label="Last Health Check" value={formatTimeAgo(settings.last_health_check)} />
            <InfoTile label="Last Seen" value={formatTimeAgo(settings.last_seen)} />
            <InfoTile label="Heartbeat Interval" value={settings.heartbeat_interval ? `${settings.heartbeat_interval}s` : '—'} />
            <InfoTile label="Last Heartbeat" value={formatTimeAgo(settings.last_heartbeat_at)} />
            <InfoTile
              label="Latency"
              value={settings.latency_ms ? `${settings.latency_ms}ms` : '—'}
              icon={<Gauge className="h-3 w-3 text-muted-foreground" />}
            />
            <InfoTile
              label="Engine"
              value={stats.running ? 'Running' : 'Stopped'}
              icon={<Heart className={`h-3 w-3 ${stats.running ? 'text-emerald-500 animate-pulse' : 'text-muted-foreground'}`} />}
            />
            <InfoTile label="Updated At" value={formatTimeAgo(settings.updated_at)} />
          </div>
        </Card>
      )}

      {/* Activity Timeline */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Activity Timeline</h3>
        </div>

        {activity.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No activity recorded yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            <AnimatePresence>
              {activity.map((event, index) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index * 0.05, 0.3) }}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/30"
                >
                  <div className={`h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 ${getActivityColor(event.type)}`}>
                    {getActivityIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{event.message}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </Card>

      {/* Security Notice */}
      <Card className="p-4 bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800/40">
        <div className="flex items-start gap-3">
          <Shield className="h-4 w-4 text-sky-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-sky-800 dark:text-sky-300">
            <span className="font-medium">Security: </span>
            The Project Token is stored only on this device. All communication uses HTTPS with Bearer token authentication.
            The token is never logged, printed, or exposed except through the reveal button.
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.Disconnected;
  const Icon = status === 'Connected' ? Wifi : status === 'Offline' ? WifiOff : AlertCircle;

  return (
    <Badge variant="outline" className={`gap-1 ${colors.bg} ${colors.text} ${colors.border}`}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

function InfoTile({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg border">
      <div className="flex items-center gap-1.5 mb-0.5">
        {icon}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-sm font-medium ${mono ? 'font-mono text-xs' : ''}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function getActivityColor(type: ActivityType): string {
  const colors: Record<ActivityType, string> = {
    connection_started: 'bg-blue-500/15',
    registration_success: 'bg-emerald-500/15',
    registration_failed: 'bg-red-500/15',
    disconnected: 'bg-amber-500/15',
    reconnect: 'bg-blue-500/15',
    reconnect_success: 'bg-emerald-500/15',
    reconnect_failed: 'bg-red-500/15',
    health_check: 'bg-sky-500/15',
    health_check_failed: 'bg-amber-500/15',
    heartbeat: 'bg-emerald-500/15',
    heartbeat_failed: 'bg-amber-500/15',
    offline: 'bg-amber-500/15',
    online: 'bg-emerald-500/15',
    authentication_failed: 'bg-red-500/15',
    timeout: 'bg-amber-500/15',
    server_unreachable: 'bg-red-500/15',
  };
  return colors[type];
}

function getActivityIcon(type: ActivityType): React.ReactNode {
  const icons: Record<ActivityType, React.ReactNode> = {
    connection_started: <Link2 className="h-3.5 w-3.5 text-blue-600" />,
    registration_success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
    registration_failed: <AlertCircle className="h-3.5 w-3.5 text-red-600" />,
    disconnected: <Link2Off className="h-3.5 w-3.5 text-amber-600" />,
    reconnect: <RefreshCw className="h-3.5 w-3.5 text-blue-600" />,
    reconnect_success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
    reconnect_failed: <AlertCircle className="h-3.5 w-3.5 text-red-600" />,
    health_check: <Activity className="h-3.5 w-3.5 text-sky-600" />,
    health_check_failed: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
    heartbeat: <Heart className="h-3.5 w-3.5 text-emerald-600" />,
    heartbeat_failed: <AlertCircle className="h-3.5 w-3.5 text-amber-600" />,
    offline: <WifiOff className="h-3.5 w-3.5 text-amber-600" />,
    online: <Wifi className="h-3.5 w-3.5 text-emerald-600" />,
    authentication_failed: <AlertCircle className="h-3.5 w-3.5 text-red-600" />,
    timeout: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
    server_unreachable: <AlertCircle className="h-3.5 w-3.5 text-red-600" />,
  };
  return icons[type];
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </div>
      </div>
      <Card className="p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
      <Card className="p-6 space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </Card>
    </div>
  );
}
