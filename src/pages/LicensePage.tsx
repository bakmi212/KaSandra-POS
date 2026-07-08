// Modern License Page - Dynamic Subscription Center
// Everything is loaded dynamically from the License Server
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { licenseClient, type LicenseResponse, type LicenseFeature } from '@/lib/license-client';
import { useBrandingStore } from '@/lib/branding-store';
import {
  Check, Sparkles, Zap, Crown, ChevronRight,
  Clock, Monitor, Server, Wifi, WifiOff, Loader2, AlertCircle,
  CheckCircle2, ArrowRight, Star, TrendingUp, Gift, X, History, CreditCard,
  RefreshCw, Calendar, Building2, Shield, Database
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface Package {
  id: string;
  name: string;
  code: string;
  price: number;
  durationDays: number;
  maxDevices: number;
  trialDays: number;
  label: string | null;
  description: string | null;
  menuPermissions: string[];
  features: LicenseFeature[];
}

interface ProjectInfo {
  name: string;
  description: string | null;
  logo: string | null;
  version: string;
  publisher: string;
  platform?: string;
  serverStatus?: 'online' | 'offline' | 'maintenance';
  serverVersion?: string;
}

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license-api`;
const PROJECT_API_KEY = 'ksandra_prod_2026';

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function LicensePage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { branding } = useBrandingStore();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [licenseData, setLicenseData] = useState<LicenseResponse | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    name: 'KaSandra POS',
    description: 'Modern Retail Management System',
    logo: null,
    version: '3.0.0',
    publisher: 'KaSandra',
    platform: 'Web',
    serverStatus: 'online',
    serverVersion: '1.0.0',
  });
  const [licenseKeyDialogOpen, setLicenseKeyDialogOpen] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [activating, setActivating] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline'>('online');
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'maintenance'>('online');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // Load all data from server
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch packages
      const packagesRes = await fetch(`${API_BASE}/v1/packages?projectApiKey=${PROJECT_API_KEY}`).then(r => r.json());

      if (packagesRes.success) {
        setPackages(packagesRes.packages || []);
        if (packagesRes.project) {
          setProjectInfo(prev => ({
            ...prev,
            name: packagesRes.project.name || prev.name,
            description: packagesRes.project.description || prev.description,
            logo: packagesRes.project.logo || prev.logo,
            serverVersion: packagesRes.project.server_version || prev.serverVersion,
          }));
        }
      }

      // Fetch project connection info
      const connectRes = await fetch(`${API_BASE}/v1/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectApiKey: PROJECT_API_KEY }),
      }).then(r => r.json());

      if (connectRes.success) {
        setProjectInfo(prev => ({
          ...prev,
          platform: connectRes.platform || 'Web',
          serverVersion: connectRes.server_version || prev.serverVersion,
        }));
      }

      // Check existing license
      const storedKey = localStorage.getItem('license_key');
      if (storedKey) {
        const licenseRes = await licenseClient.getStatus(storedKey);
        if (licenseRes.success) {
          setLicenseData(licenseRes);
        }
      }

      // Check client connection status
      const storedClientId = localStorage.getItem('client_id');
      if (storedClientId) {
        // Connection already established
      }

      const now = new Date().toISOString();
      setLastSyncAt(now);
      localStorage.setItem('last_sync_at', now);

      setConnectionStatus('online');
      setServerStatus('online');
    } catch {
      setConnectionStatus('offline');
      setServerStatus('offline');
      // Load cached last sync
      const cachedSync = localStorage.getItem('last_sync_at');
      if (cachedSync) setLastSyncAt(cachedSync);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh license
  const handleRefresh = async () => {
    const storedKey = localStorage.getItem('license_key');
    if (!storedKey) return;
    setRefreshing(true);
    try {
      const res = await licenseClient.refresh(storedKey);
      if (res.success) {
        setLicenseData(res);
        toast({ title: 'Lisensi diperbarui' });
      }
    } catch {
      toast({ title: 'Gagal menyegarkan', variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  // Activate license key
  const handleActivateKey = async () => {
    if (!licenseKeyInput.trim()) return;
    setActivating(true);
    try {
      const res = await licenseClient.activate(licenseKeyInput.trim().toUpperCase());
      if (res.success) {
        localStorage.setItem('license_key', res.licenseKey);
        setLicenseData(res);
        setLicenseKeyDialogOpen(false);
        setLicenseKeyInput('');
        toast({ title: 'Lisensi berhasil diaktivasi' });
      } else {
        toast({ title: res.message || 'Aktivasi gagal', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: e.message || 'Terjadi kesalahan', variant: 'destructive' });
    } finally {
      setActivating(false);
    }
  };

  // Start trial
  const handleStartTrial = async () => {
    setActivating(true);
    try {
      const res = await licenseClient.createTrial();
      if (res.success) {
        localStorage.setItem('license_key', res.licenseKey);
        setLicenseData(res);
        toast({ title: 'Trial dimulai', description: `${res.daysRemaining} hari tersedia` });
      } else {
        toast({ title: res.message || 'Gagal membuat trial', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: e.message || 'Terjadi kesalahan', variant: 'destructive' });
    } finally {
      setActivating(false);
    }
  };

  // Deactivate
  const handleDeactivate = async () => {
    const storedKey = localStorage.getItem('license_key');
    if (!storedKey) return;
    try {
      await licenseClient.deactivate(storedKey);
      localStorage.removeItem('license_key');
      setLicenseData(null);
      toast({ title: 'Perangkat dinonaktifkan' });
    } catch {
      toast({ title: 'Gagal menonaktifkan', variant: 'destructive' });
    }
  };

  // Select package - navigate to payment page
  const handleSelectPackage = (pkg: Package) => {
    navigate(`/payment?package=${pkg.code}`);
  };

  // Open payment history
  const handleOpenHistory = () => {
    navigate('/payment-history');
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              {projectInfo.logo ? (
                <img src={projectInfo.logo} alt={projectInfo.name} className="h-9 w-9 rounded-lg object-contain" />
              ) : (
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-semibold">{branding.applicationName || projectInfo.name}</h1>
                  <Badge variant="secondary" className="text-xs">v{branding.version || projectInfo.version}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {licenseData && (
                    <>
                      <span className="flex items-center gap-1">
                        <Crown className="h-3 w-3 text-amber-500" />
                        {licenseData.planName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {licenseData.daysRemaining > 0 ? `${licenseData.daysRemaining} days left` : 'Expired'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Last Sync */}
              {lastSyncAt && (
                <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Sync: {formatTimeAgo(lastSyncAt)}</span>
                </div>
              )}
              {/* Refresh */}
              <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={refreshing} className="h-8 w-8">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              {/* Payment History */}
              <Button variant="ghost" size="sm" onClick={handleOpenHistory}>
                <History className="h-4 w-4" />
              </Button>
              {/* Connection Status */}
              <div className="flex items-center gap-1.5 text-sm px-2 py-1 rounded-md">
                {connectionStatus === 'online' ? (
                  <Wifi className="h-4 w-4 text-emerald-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-amber-500" />
                )}
                <span className={`text-xs font-medium hidden sm:inline ${connectionStatus === 'online' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {connectionStatus === 'online' ? 'Connected' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* OFFLINE MODE BANNER */}
      {connectionStatus === 'offline' && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-sm text-amber-700">
            <Database className="h-4 w-4" />
            <span>Offline Mode — Using last synchronized data</span>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {/* SECTION 0: PROJECT INFO */}
        <ProjectInfoSection
          projectInfo={projectInfo}
          serverStatus={serverStatus}
          lastSyncAt={lastSyncAt}
        />

        {/* SECTION 1: CURRENT LICENSE */}
        <CurrentLicenseSection
          licenseData={licenseData}
          loading={loading}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onActivateKey={() => setLicenseKeyDialogOpen(true)}
          onStartTrial={handleStartTrial}
          onDeactivate={handleDeactivate}
          activating={activating}
        />

        {/* SECTION 2: PRICING PACKAGES */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Subscription Packages</h2>
            <p className="text-muted-foreground">Choose the package that fits your business needs</p>
          </div>

          {loading ? (
            <PackageSkeletonGrid />
          ) : packages.length === 0 ? (
            <div className="text-center py-16">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No subscription packages available</h3>
              <p className="text-muted-foreground text-sm">Hubungi administrator untuk informasi lebih lanjut</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3 lg:gap-8">
              {packages.map((pkg, idx) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  isActive={licenseData?.plan === pkg.code}
                  delay={idx * 0.1}
                  onSelect={() => handleSelectPackage(pkg)}
                />
              ))}
            </div>
          )}
        </section>

        {/* SECTION 3: COMPARISON TABLE */}
        {!loading && packages.length > 0 && (
          <ComparisonTable packages={packages} />
        )}

        {/* SECTION 4: FAQ */}
        <FAQSection />
      </main>

      {/* LICENSE KEY DIALOG */}
      <Dialog open={licenseKeyDialogOpen} onOpenChange={setLicenseKeyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Masukkan Kode Lisensi</DialogTitle>
            <DialogDescription>
              Masukkan kode lisensi yang Anda terima melalui email
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <input
              type="text"
              value={licenseKeyInput}
              onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="w-full px-4 py-3 rounded-lg border bg-background font-mono text-center tracking-wider text-lg"
            />
            <Button
              className="w-full"
              onClick={handleActivateKey}
              disabled={activating || !licenseKeyInput.trim()}
            >
              {activating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Aktifkan Lisensi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// CURRENT LICENSE SECTION
// ============================================================

function CurrentLicenseSection({
  licenseData,
  loading,
  refreshing,
  onRefresh,
  onActivateKey,
  onStartTrial,
  onDeactivate,
  activating,
}: {
  licenseData: LicenseResponse | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onActivateKey: () => void;
  onStartTrial: () => void;
  onDeactivate: () => void;
  activating: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-muted/30 rounded-2xl p-6 animate-pulse">
        <div className="h-24 bg-muted rounded-xl" />
      </div>
    );
  }

  if (!licenseData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border"
      >
        <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Gift className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">No Active Subscription</h2>
              <p className="text-muted-foreground">Start your free trial or activate a license key</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={onStartTrial} disabled={activating} className="gap-2">
              {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Start Free Trial
            </Button>
            <Button variant="outline" onClick={onActivateKey} className="gap-2">
              <CreditCard className="h-4 w-4" />
              I Have a License Key
            </Button>
          </div>
        </div>
        <div className="absolute -right-8 -bottom-8 h-40 w-40 rounded-full bg-primary/5" />
      </motion.div>
    );
  }

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    active: { label: 'Active', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    trial: { label: 'Trial', color: 'text-amber-500', bg: 'bg-amber-500/10' },
    expired: { label: 'Expired', color: 'text-red-500', bg: 'bg-red-500/10' },
    inactive: { label: 'Inactive', color: 'text-muted-foreground', bg: 'bg-muted' },
  };

  const status = statusConfig[licenseData.status] || statusConfig.inactive;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border bg-card overflow-hidden"
    >
      <div className="p-6 bg-gradient-to-r from-muted/50 to-transparent">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-xl ${status.bg} flex items-center justify-center`}>
              <Crown className={`h-7 w-7 ${status.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-bold">{licenseData.planName || 'Package'}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                  {status.label}
                </span>
              </div>
              <p className="text-muted-foreground">
                {licenseData.daysRemaining > 0
                  ? `${licenseData.daysRemaining} days remaining`
                  : 'License expired'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 border-t">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase">Package</p>
            <p className="font-semibold">{licenseData.planName}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase">Devices</p>
            <p className="font-semibold">{licenseData.activatedDevices}/{licenseData.maxDevices}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase">Activated</p>
            <p className="font-semibold">
              {licenseData.device?.deviceName || 'This Device'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase">Expires</p>
            <p className="font-semibold">
              {licenseData.expiresAt
                ? new Date(licenseData.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                : '-'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase">Status</p>
            <p className={`font-semibold ${status.color}`}>{status.label}</p>
          </div>
        </div>

        {/* Registered Device */}
        {licenseData.device && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Monitor className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{licenseData.device.deviceName || licenseData.device.deviceId}</p>
                <p className="text-xs text-muted-foreground">
                  {licenseData.device.platform} • v{licenseData.device.appVersion}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {licenseData.device.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
        )}

        {licenseData.features && licenseData.features.length > 0 && (
          <div className="mt-4 pt-4 border-t flex flex-wrap gap-2">
            {licenseData.features.slice(0, 8).map((f) => (
              <Badge key={f.key} variant="secondary" className="text-xs">
                {f.key}: {String(f.value)}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={onDeactivate}>
            Deactivate Device
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// PACKAGE CARD
// ============================================================

function PackageCard({
  pkg,
  isActive,
  delay,
  onSelect,
}: {
  pkg: Package;
  isActive: boolean;
  delay: number;
  onSelect: () => void;
}) {
  const labelConfig: Record<string, { label: string; icon: typeof Star; color: string; bg: string; border: string }> = {
    best_seller: { label: 'Best Seller', icon: TrendingUp, color: 'text-blue-500', bg: 'bg-blue-500', border: 'ring-blue-500/30' },
    recommended: { label: 'Recommended', icon: Sparkles, color: 'text-emerald-500', bg: 'bg-emerald-500', border: 'ring-emerald-500/30' },
    popular: { label: 'Popular', icon: Star, color: 'text-orange-500', bg: 'bg-orange-500', border: 'ring-orange-500/30' },
    premium: { label: 'Premium', icon: Crown, color: 'text-purple-500', bg: 'bg-purple-500', border: 'ring-purple-500/30' },
    new: { label: 'New', icon: Zap, color: 'text-sky-500', bg: 'bg-sky-500', border: 'ring-sky-500/30' },
  };

  const config = pkg.label ? labelConfig[pkg.label] : null;
  const LabelIcon = config?.icon || Star;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={`relative group ${config ? 'ring-2 ' + config.border : ''}`}
    >
      {config && (
        <div className={`absolute -top-3 left-4 z-10 px-3 py-1 rounded-full ${config.bg} text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg`}>
          <LabelIcon className="h-3 w-3" />
          {config.label}
        </div>
      )}

      <div
        className={`h-full rounded-2xl border bg-card overflow-hidden transition-all duration-300
          ${config ? 'hover:shadow-xl hover:shadow-' + pkg.label?.split('_')[0] + '-500/10' : 'hover:shadow-lg'}
          ${isActive ? 'ring-2 ring-primary' : ''}`}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-1">{pkg.name}</h3>
          {pkg.description && (
            <p className="text-sm text-muted-foreground mb-4">{pkg.description}</p>
          )}

          <div className="flex items-baseline gap-1 mb-4">
            <span className="text-4xl font-bold">
              {pkg.price > 0 ? `Rp ${pkg.price.toLocaleString('id-ID')}` : 'Free'}
            </span>
            {pkg.price > 0 && (
              <span className="text-muted-foreground">/{pkg.durationDays} days</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Monitor className="h-4 w-4" />
            <span>{pkg.maxDevices > 1 ? `Up to ${pkg.maxDevices} devices` : '1 device'}</span>
          </div>

          <div className="space-y-3 mb-6">
            <p className="text-xs font-medium text-muted-foreground uppercase">Included Features</p>
            {pkg.menuPermissions.slice(0, 8).map((perm) => (
              <div key={perm} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <Check className="h-3 w-3 text-emerald-500" />
                </div>
                <span className="text-sm">{perm}</span>
              </div>
            ))}
            {pkg.menuPermissions.length > 8 && (
              <p className="text-xs text-muted-foreground">+{pkg.menuPermissions.length - 8} more features</p>
            )}
          </div>

          <Button
            className="w-full gap-2"
            variant={isActive ? 'outline' : 'default'}
            disabled={isActive}
            onClick={onSelect}
          >
            {isActive ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Current Plan
              </>
            ) : (
              <>
                Subscribe
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// COMPARISON TABLE
// ============================================================

function ComparisonTable({ packages }: { packages: Package[] }) {
  const [expanded, setExpanded] = useState(false);

  // Collect all unique features
  const allFeatures = new Set<string>();
  packages.forEach(pkg => {
    pkg.menuPermissions.forEach(p => allFeatures.add(p));
  });
  const featureList = Array.from(allFeatures);

  return (
    <section>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Compare Packages</h2>
        <p className="text-muted-foreground">See feature comparison for each package</p>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-4 font-medium">Feature</th>
                {packages.map(pkg => (
                  <th key={pkg.id} className="text-center p-4 font-medium min-w-[120px]">
                    {pkg.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Price row */}
              <tr className="border-b">
                <td className="p-4 font-medium">Price</td>
                {packages.map(pkg => (
                  <td key={pkg.id} className="text-center p-4">
                    <span className="font-bold">
                      {pkg.price > 0 ? `Rp ${pkg.price.toLocaleString('id-ID')}` : 'Free'}
                    </span>
                  </td>
                ))}
              </tr>
              {/* Duration row */}
              <tr className="border-b">
                <td className="p-4 font-medium">Duration</td>
                {packages.map(pkg => (
                  <td key={pkg.id} className="text-center p-4 text-muted-foreground">
                    {pkg.durationDays} days
                  </td>
                ))}
              </tr>
              {/* Device row */}
              <tr className="border-b">
                <td className="p-4 font-medium">Devices</td>
                {packages.map(pkg => (
                  <td key={pkg.id} className="text-center p-4 text-muted-foreground">
                    {pkg.maxDevices}
                  </td>
                ))}
              </tr>
              {/* Feature rows */}
              {(expanded ? featureList : featureList.slice(0, 6)).map(feature => (
                <tr key={feature} className="border-b last:border-0">
                  <td className="p-4 text-sm">{feature}</td>
                  {packages.map(pkg => (
                    <td key={pkg.id} className="text-center p-4">
                      {pkg.menuPermissions.includes(feature) ? (
                        <Check className="h-5 w-5 text-emerald-500 inline-block" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground/30 inline-block" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {featureList.length > 6 && (
          <div className="p-4 border-t text-center">
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show Less' : `View ${featureList.length - 6} more features`}
              <ChevronRight className={`h-4 w-4 ml-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// FAQ SECTION
// ============================================================

function FAQSection() {
  const faqs = [
    { q: 'How do I pay for a subscription?', a: 'Select a package, then choose a payment method (Bank Transfer or Midtrans). After payment, your license will be verified within 24 hours.' },
    { q: 'How do I activate my license?', a: 'After payment is confirmed, you will receive a license key via email. Enter the code in the app to activate your package.' },
    { q: 'Can I upgrade my package?', a: 'Yes! You can upgrade anytime. Remaining time from your current package will be converted to the new package.' },
    { q: 'What happens when my license expires?', a: 'You can still access your data, but premium features will be disabled until renewal.' },
  ];

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Frequently Asked Questions</h2>
        <p className="text-muted-foreground">Find answers to common questions</p>
      </div>

      <div className="max-w-2xl mx-auto space-y-4">
        {faqs.map((faq, idx) => (
          <div
            key={idx}
            className="rounded-xl border bg-card overflow-hidden"
          >
            <button
              onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
              className="w-full p-4 flex items-center justify-between text-left"
            >
              <span className="font-medium">{faq.q}</span>
              <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${openIndex === idx ? 'rotate-90' : ''}`} />
            </button>
            <AnimatePresence>
              {openIndex === idx && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <p className="px-4 pb-4 text-muted-foreground">{faq.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// SKELETON
// ============================================================

function PackageSkeletonGrid() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border bg-card p-6 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-4" />
          <div className="h-10 bg-muted rounded w-2/3 mb-4" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="h-5 bg-muted rounded" />
            ))}
          </div>
          <div className="h-10 bg-muted rounded w-full mt-6" />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// PROJECT INFO SECTION
// ============================================================

function ProjectInfoSection({
  projectInfo,
  serverStatus,
  lastSyncAt,
}: {
  projectInfo: ProjectInfo;
  serverStatus: 'online' | 'offline' | 'maintenance';
  lastSyncAt: string | null;
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            {projectInfo.logo ? (
              <img src={projectInfo.logo} alt={projectInfo.name} className="h-8 w-8 object-contain" />
            ) : (
              <Building2 className="h-6 w-6 text-primary" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold">{projectInfo.name}</h3>
              <Badge variant="outline" className="text-xs">{projectInfo.platform || 'Web'}</Badge>
            </div>
            {projectInfo.description && (
              <p className="text-sm text-muted-foreground mb-2">{projectInfo.description}</p>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Server className="h-3.5 w-3.5" />
                Server v{projectInfo.serverVersion || '1.0.0'}
              </span>
              <span className="flex items-center gap-1">
                {serverStatus === 'online' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                )}
                Server {serverStatus === 'online' ? 'Online' : serverStatus === 'maintenance' ? 'Maintenance' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">License Server</span>
          </div>
          {lastSyncAt && (
            <span className="text-xs text-muted-foreground">
              Last sync: {formatTimeAgo(lastSyncAt)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
