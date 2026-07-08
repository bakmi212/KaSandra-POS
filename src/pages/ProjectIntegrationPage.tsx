// Sprint 2.1 — Project Registration: Client Application
// Connect the Client Application to a License Server via HTTPS.
// No product name is mentioned — only "Client Application" / "License Server".
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Server, Key, Eye, EyeOff, Wifi, WifiOff, Loader2, CheckCircle2,
  AlertCircle, Activity, Zap, Clock, Link2, Link2Off, RefreshCw,
  RotateCcw, Copy, Hash, Globe, ShieldCheck, AlertTriangle,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

type RegistrationStatus = 'disconnected' | 'registering' | 'registered' | 'failed';

interface ProjectData {
  serverUrl: string;
  projectToken: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  registrationStatus: RegistrationStatus;
  apiVersion: string;
  applicationVersion: string;
  registeredAt: string;
  lastHealthCheck: string;
  lastError: string;
}

interface TestResult {
  success: boolean;
  status?: string;
  apiVersion?: string;
  applicationVersion?: string;
  responseTimeMs?: number;
  errorCode?: string;
  message?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

const STORAGE_KEY = 'license_server_registration';
const APP_VERSION = '1.0.0';
const PLATFORM = 'web';
const REQUEST_TIMEOUT_MS = 10_000;

// ============================================================
// HELPERS
// ============================================================

function buildApiUrl(serverUrl: string, endpoint: string): string {
  const base = serverUrl.replace(/\/+$/, '');
  return `${base}/api/internal/${endpoint}`;
}

function formatDateTime(iso?: string): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

type FetchError = Error & { name?: string; message: string };

function classifyError(err: FetchError | null, status?: number): { code: string; message: string } {
  if (err?.name === 'AbortError') return { code: 'TIMEOUT', message: 'Request timed out. The License Server did not respond in time.' };
  if (err?.message?.includes('Failed to fetch') || err?.message?.includes('fetch')) {
    return { code: 'NETWORK_ERROR', message: 'Network error. Unable to reach the License Server.' };
  }
  if (status === 401) return { code: 'UNAUTHORIZED', message: 'Unauthorized. The Project Token was rejected by the License Server.' };
  if (status === 0 || status === 503) return { code: 'SERVER_OFFLINE', message: 'Server Offline. The License Server is not responding.' };
  if (status && status >= 500) return { code: 'SERVER_ERROR', message: `Server error (HTTP ${status}).` };
  return { code: 'NETWORK_ERROR', message: err?.message || 'Network error.' };
}

function loadFromStorage(): ProjectData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProjectData) : null;
  } catch { return null; }
}

function saveToStorage(data: ProjectData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}

// ============================================================
// COMPONENT
// ============================================================

export default function ProjectIntegrationPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<ProjectData | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [projectToken, setProjectToken] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  useEffect(() => {
    const data = loadFromStorage();
    if (data) {
      setSaved(data);
      setServerUrl(data.serverUrl);
      setProjectToken(data.projectToken);
      setProjectName(data.projectName);
      setProjectSlug(data.projectSlug);
    }
    setLoading(false);
  }, []);

  const persist = useCallback((data: ProjectData) => {
    setSaved(data);
    saveToStorage(data);
  }, []);

  // ============================================================
  // TEST CONNECTION — GET /api/internal/health
  // ============================================================

  const testConnection = async () => {
    if (!serverUrl.trim()) {
      toast({ title: 'Validation Error', description: 'License Server URL is required.', variant: 'destructive' });
      return;
    }
    if (!projectToken.trim()) {
      toast({ title: 'Validation Error', description: 'Project Token is required.', variant: 'destructive' });
      return;
    }

    setTesting(true);
    setTestResult(null);
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(buildApiUrl(serverUrl, 'health'), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${projectToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const elapsed = Date.now() - start;
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setTestResult({
          success: true,
          status: data.status,
          apiVersion: data.api_version,
          applicationVersion: data.application_version,
          responseTimeMs: elapsed,
        });
      } else {
        const err = classifyError(null, res.status);
        setTestResult({
          success: false,
          errorCode: data.code || err.code,
          message: data.message || err.message,
          responseTimeMs: elapsed,
        });
      }
    } catch (err) {
      const e = err as FetchError;
      clearTimeout(timeout);
      const errInfo = classifyError(e);
      setTestResult({ success: false, errorCode: errInfo.code, message: errInfo.message, responseTimeMs: Date.now() - start });
    } finally {
      setTesting(false);
    }
  };

  // ============================================================
  // REGISTER — POST /api/internal/register
  // ============================================================

  const register = async () => {
    if (!serverUrl.trim() || !projectToken.trim()) {
      toast({ title: 'Validation Error', description: 'License Server URL and Project Token are required.', variant: 'destructive' });
      return;
    }
    if (!projectName.trim() || !projectSlug.trim()) {
      toast({ title: 'Validation Error', description: 'Project Name and Project Slug are required.', variant: 'destructive' });
      return;
    }

    setRegistering(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(buildApiUrl(serverUrl, 'register'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${projectToken}`,
        },
        body: JSON.stringify({
          project_name: projectName.trim(),
          project_slug: projectSlug.trim(),
          platform: PLATFORM,
          application_version: APP_VERSION,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        const now = new Date().toISOString();
        persist({
          serverUrl: serverUrl.trim(),
          projectToken: projectToken.trim(),
          projectId: data.project_id,
          projectName: projectName.trim(),
          projectSlug: projectSlug.trim(),
          registrationStatus: 'registered',
          apiVersion: data.api_version || 'v1',
          applicationVersion: data.application_version || APP_VERSION,
          registeredAt: now,
          lastHealthCheck: now,
          lastError: '',
        });
        toast({ title: 'Registration Successful', description: `Project ${data.project_code} registered.` });
      } else {
        const errInfo = classifyError(null, res.status);
        const errorMsg = data.message || errInfo.message;
        persist({
          serverUrl: serverUrl.trim(),
          projectToken: projectToken.trim(),
          projectId: saved?.projectId || '',
          projectName: projectName.trim(),
          projectSlug: projectSlug.trim(),
          registrationStatus: 'failed',
          apiVersion: saved?.apiVersion || '',
          applicationVersion: saved?.applicationVersion || '',
          registeredAt: saved?.registeredAt || '',
          lastHealthCheck: saved?.lastHealthCheck || '',
          lastError: errorMsg,
        });
        toast({ title: 'Registration Failed', description: errorMsg, variant: 'destructive' });
      }
    } catch (err) {
      const e = err as FetchError;
      clearTimeout(timeout);
      const errInfo = classifyError(e);
      persist({
        serverUrl: serverUrl.trim(),
        projectToken: projectToken.trim(),
        projectId: saved?.projectId || '',
        projectName: projectName.trim(),
        projectSlug: projectSlug.trim(),
        registrationStatus: 'failed',
        apiVersion: saved?.apiVersion || '',
        applicationVersion: saved?.applicationVersion || '',
        registeredAt: saved?.registeredAt || '',
        lastHealthCheck: saved?.lastHealthCheck || '',
        lastError: errInfo.message,
      });
      toast({ title: 'Registration Failed', description: errInfo.message, variant: 'destructive' });
    } finally {
      setRegistering(false);
    }
  };

  // ============================================================
  // HEALTH CHECK (when registered)
  // ============================================================

  const performHealthCheck = async () => {
    if (!saved) return;
    setCheckingHealth(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(buildApiUrl(saved.serverUrl, 'health'), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${saved.projectToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        const now = new Date().toISOString();
        persist({
          ...saved,
          lastHealthCheck: now,
          apiVersion: data.api_version || saved.apiVersion,
          applicationVersion: data.application_version || saved.applicationVersion,
          lastError: '',
        });
        toast({ title: 'License Server Online', description: `Status: ${data.status}` });
      } else {
        const errInfo = classifyError(null, res.status);
        toast({ title: 'Health Check Failed', description: data.message || errInfo.message, variant: 'destructive' });
      }
    } catch (err) {
      const e = err as FetchError;
      clearTimeout(timeout);
      const errInfo = classifyError(e);
      toast({ title: 'Health Check Failed', description: errInfo.message, variant: 'destructive' });
    } finally {
      setCheckingHealth(false);
    }
  };

  // ============================================================
  // DISCONNECT
  // ============================================================

  const disconnect = async () => {
    setDisconnecting(true);
    setDisconnectDialogOpen(false);
    clearStorage();
    setSaved(null);
    setServerUrl('');
    setProjectToken('');
    setProjectName('');
    setProjectSlug('');
    setTestResult(null);
    toast({ title: 'Disconnected', description: 'Project registration cleared from this device.' });
    setDisconnecting(false);
  };

  // ============================================================
  // RENDER
  // ============================================================

  if (loading) return <LoadingSkeleton />;

  const isRegistered = saved?.registrationStatus === 'registered';
  const isFailed = saved?.registrationStatus === 'failed';
  const isBusy = testing || registering || disconnecting || checkingHealth;

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold">License Server</h1>
          {(isRegistered || isFailed) && <StatusBadge status={saved!.registrationStatus} />}
        </div>
        <p className="text-sm text-muted-foreground">
          Connect this Client Application to a License Server. Enter the License Server URL and Project Token to register.
        </p>
      </div>

      {/* Project Card — shown when registered or failed */}
      {(isRegistered || isFailed) && saved && (
        <ProjectCard
          data={saved}
          showToken={showToken}
          onToggleToken={() => setShowToken(!showToken)}
          onCopyToken={() => {
            navigator.clipboard.writeText(saved.projectToken);
            toast({ title: 'Token Copied' });
          }}
          onHealthCheck={performHealthCheck}
          onRetry={register}
          onDisconnect={() => setDisconnectDialogOpen(true)}
          isBusy={isBusy}
          isCheckingHealth={checkingHealth}
          isRetrying={registering}
        />
      )}

      {/* Configuration Form — shown when not registered or when failed */}
      {!isRegistered && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Link2 className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-semibold">Connection Settings</h2>
          </div>

          <div className="space-y-4">
            {/* License Server URL */}
            <div className="space-y-2">
              <Label htmlFor="server-url">License Server URL</Label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="server-url"
                  type="url"
                  placeholder="https://lisensi.example.com"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">The base URL of your License Server.</p>
            </div>

            {/* Project Token */}
            <div className="space-y-2">
              <Label htmlFor="project-token">Project Token</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="project-token"
                  type={showToken ? 'text' : 'password'}
                  placeholder="kas_xxxxxxxxxxxxxxxxx"
                  value={projectToken}
                  onChange={(e) => setProjectToken(e.target.value)}
                  className="pl-9 pr-10 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Paste the token issued by your License Server administrator.</p>
            </div>

            {/* Project Name */}
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="My Application"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>

            {/* Project Slug */}
            <div className="space-y-2">
              <Label htmlFor="project-slug">Project Slug</Label>
              <Input
                id="project-slug"
                placeholder="my-application"
                value={projectSlug}
                onChange={(e) => setProjectSlug(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">A unique identifier slug for this project.</p>
            </div>
          </div>

          {/* Error display */}
          {isFailed && saved?.lastError && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">Registration Error</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{saved.lastError}</p>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Test Connection Result */}
      {testResult && !isRegistered && (
        <Card className={`p-4 ${testResult.success ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <div className="flex items-start gap-3">
            <div className={`h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0 ${testResult.success ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
              {testResult.success
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                : <AlertCircle className="h-4 w-4 text-red-600" />}
            </div>
            <div className="flex-1">
              <p className={`font-medium text-sm ${testResult.success ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                {testResult.success ? 'Server Online' : 'Connection Failed'}
              </p>
              {testResult.success ? (
                <div className="mt-2 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">API Version</p>
                    <p className="text-xs font-medium">{testResult.apiVersion || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">App Version</p>
                    <p className="text-xs font-medium">v{testResult.applicationVersion || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Response Time</p>
                    <p className="text-xs font-medium">{testResult.responseTimeMs}ms</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  {testResult.errorCode ? `[${testResult.errorCode}] ` : ''}{testResult.message}
                  {testResult.responseTimeMs ? ` (${testResult.responseTimeMs}ms)` : ''}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      {!isRegistered && (
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={testConnection} disabled={isBusy}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Activity className="h-4 w-4 mr-2" />}
            Test Connection
          </Button>
          <Button onClick={register} disabled={isBusy || !serverUrl || !projectToken || !projectName || !projectSlug}>
            {registering ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
            {registering ? 'Registering...' : 'Register'}
          </Button>
        </div>
      )}

      {/* Security Notice */}
      <Card className="p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-medium">Security: </span>
            The Project Token is stored only on this device. All communication uses HTTPS with Bearer token authentication.
          </div>
        </div>
      </Card>

      {/* Disconnect Confirmation */}
      <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect from License Server</DialogTitle>
            <DialogDescription>
              This will clear the Project Token and all registration data from this device. You will need to re-enter the token to reconnect.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2Off className="h-4 w-4 mr-2" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// STATUS BADGE
// ============================================================

function StatusBadge({ status }: { status: RegistrationStatus }) {
  const configs: Record<RegistrationStatus, { label: string; className: string; icon: typeof Wifi }> = {
    disconnected: { label: 'Disconnected', className: 'text-slate-600 bg-slate-100 dark:bg-slate-800 border-slate-300', icon: WifiOff },
    registering: { label: 'Registering...', className: 'text-blue-600 bg-blue-50 dark:bg-blue-950 border-blue-200', icon: Loader2 },
    registered: { label: 'Connected', className: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950 border-emerald-200', icon: Wifi },
    failed: { label: 'Failed', className: 'text-red-600 bg-red-50 dark:bg-red-950 border-red-200', icon: AlertTriangle },
  };
  const cfg = configs[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-xs gap-1 ${cfg.className}`}>
      <Icon className={`h-3 w-3 ${status === 'registering' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </Badge>
  );
}

// ============================================================
// PROJECT CARD
// ============================================================

function ProjectCard({ data, showToken, onToggleToken, onCopyToken, onHealthCheck, onRetry, onDisconnect, isBusy, isCheckingHealth, isRetrying }: {
  data: ProjectData;
  showToken: boolean;
  onToggleToken: () => void;
  onCopyToken: () => void;
  onHealthCheck: () => void;
  onRetry: () => void;
  onDisconnect: () => void;
  isBusy: boolean;
  isCheckingHealth: boolean;
  isRetrying: boolean;
}) {
  const isFailed = data.registrationStatus === 'failed';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card className={`p-5 ${isFailed ? 'border-red-500/30' : 'border-emerald-500/20'}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isFailed ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
              {isFailed
                ? <AlertTriangle className="h-5 w-5 text-red-600" />
                : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold">{data.projectName || 'Unregistered Project'}</h3>
              <p className="text-xs text-muted-foreground font-mono">{data.projectSlug}</p>
            </div>
          </div>
          <StatusBadge status={data.registrationStatus} />
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-4">
          <InfoTile icon={Hash} label="Project ID" value={data.projectId || '—'} mono />
          <InfoTile icon={Server} label="Server URL" value={data.serverUrl} />
          <InfoTile icon={Globe} label="Connection Status" value={data.registrationStatus === 'registered' ? 'Connected' : 'Failed'} />
          <InfoTile icon={Zap} label="API Version" value={data.apiVersion || '—'} />
          <InfoTile icon={CheckCircle2} label="App Version" value={data.applicationVersion ? `v${data.applicationVersion}` : '—'} />
          <InfoTile icon={Clock} label="Registered At" value={formatDateTime(data.registeredAt)} />
          <InfoTile icon={Activity} label="Last Health Check" value={formatDateTime(data.lastHealthCheck)} />
        </div>

        {/* Error display for failed status */}
        {isFailed && data.lastError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Registration Error</p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{data.lastError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Token */}
        <div className="mb-4">
          <Label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
            <Key className="h-3 w-3" />
            Project Token
          </Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 px-3 py-2 rounded-md bg-muted/50 font-mono text-xs truncate border">
              {showToken ? data.projectToken : '•'.repeat(48)}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleToken}>
              {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCopyToken}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          {isFailed ? (
            <Button onClick={onRetry} disabled={isBusy} size="sm">
              {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RotateCcw className="h-3.5 w-3.5 mr-2" />}
              Retry Registration
            </Button>
          ) : (
            <Button variant="outline" onClick={onHealthCheck} disabled={isBusy} size="sm">
              {isCheckingHealth ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RefreshCw className="h-3.5 w-3.5 mr-2" />}
              Health Check
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={onDisconnect}
            disabled={isBusy}
          >
            <Link2Off className="h-3.5 w-3.5 mr-2" />
            Disconnect
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

// ============================================================
// INFO TILE
// ============================================================

function InfoTile({ icon: Icon, label, value, mono }: {
  icon: typeof Hash; label: string; value: string; mono?: boolean;
}) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className={`text-xs font-medium truncate ${mono ? 'font-mono' : ''}`} title={value}>{value}</p>
    </div>
  );
}

// ============================================================
// LOADING SKELETON
// ============================================================

function LoadingSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Card className="p-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
  );
}
