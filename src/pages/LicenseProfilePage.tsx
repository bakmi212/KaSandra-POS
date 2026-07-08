// License Profile Page - Show license info with disconnect option
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useBrandingStore } from '@/lib/branding-store';
import { useRemoteConfigStore } from '@/lib/remote-config-store';
import { useMenuStore } from '@/lib/menu-store';
import {
  licenseClient,
  getStoredLicenseKey,
  clearStoredLicenseKey,
  type LicenseResponse,
} from '@/lib/license-client';
import {
  Server, Wifi, WifiOff, Monitor, Clock,
  RefreshCw, Unlink, Copy, Check, Key, Building2, Package, Calendar,
  ChevronRight, Zap
} from 'lucide-react';

export default function LicenseProfilePage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Stores
  const { branding } = useBrandingStore();
  const { config } = useRemoteConfigStore();
  const { clearMenus } = useMenuStore();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [licenseData, setLicenseData] = useState<LicenseResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  useEffect(() => {
    loadLicense();
  }, []);

  const loadLicense = async () => {
    setLoading(true);
    const storedKey = getStoredLicenseKey();
    if (storedKey) {
      try {
        const res = await licenseClient.getStatus(storedKey);
        if (res.success) {
          setLicenseData(res);
        }
      } catch {
        // Offline or error
      }
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    const storedKey = getStoredLicenseKey();
    if (!storedKey) return;

    setRefreshing(true);
    try {
      const res = await licenseClient.refresh(storedKey);
      if (res.success) {
        setLicenseData(res);
        toast({ title: 'Lisensi disegarkan' });
      } else {
        toast({ title: res.message || 'Gagal menyegarkan', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Gagal menyegarkan', variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  const handleDisconnect = async () => {
    const storedKey = getStoredLicenseKey();
    if (storedKey) {
      try {
        await licenseClient.deactivate(storedKey);
      } catch {}
    }

    // Clear all cached data
    clearStoredLicenseKey();
    clearMenus();
    localStorage.removeItem('branding-storage');
    localStorage.removeItem('remote-config-storage');

    toast({ title: 'Koneksi diputuskan' });
    setDisconnectDialogOpen(false);

    // Navigate back to license page
    setTimeout(() => {
      navigate('/license');
    }, 500);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string; color: string; bg: string }> = {
      active: { label: 'Aktif', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
      trial: { label: 'Trial', color: 'text-amber-600', bg: 'bg-amber-500/10' },
      expired: { label: 'Kedaluwarsa', color: 'text-red-600', bg: 'bg-red-500/10' },
      inactive: { label: 'Tidak Aktif', color: 'text-gray-600', bg: 'bg-gray-500/10' },
      suspended: { label: 'Ditangguhkan', color: 'text-red-600', bg: 'bg-red-500/10' },
    };
    return configs[status] || configs.inactive;
  };

  const statusConfig = getStatusConfig(licenseData?.status || 'inactive');

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate('/license')}>
          <ChevronRight className="h-5 w-5 rotate-180" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Profil Lisensi</h1>
          <p className="text-muted-foreground">Informasi lisensi dan perangkat</p>
        </div>
      </div>

      {loading ? (
        <ProfileSkeleton />
      ) : (
        <div className="space-y-6">
          {/* App Info Card */}
          <Card className="p-6">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                {branding.applicationLogo ? (
                  <img src={branding.applicationLogo} alt={branding.applicationName} className="h-10 w-10 object-contain" />
                ) : (
                  <Building2 className="h-8 w-8 text-primary" />
                )}
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold">{branding.applicationName}</h2>
                <p className="text-muted-foreground">{branding.companyName}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary">v{branding.version}</Badge>
                  <Badge className={`${statusConfig.bg} ${statusConfig.color}`}>
                    {licenseData?.planName || 'Tidak Ada Paket'}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>

          {/* License Status */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Status Lisensi</h3>
              <Badge className={`${statusConfig.bg} ${statusConfig.color}`}>
                {statusConfig.label}
              </Badge>
            </div>

            <div className="space-y-4">
              <InfoRow
                icon={<Package className="h-4 w-4" />}
                label="Paket"
                value={licenseData?.planName || '-'}
              />
              <InfoRow
                icon={<Calendar className="h-4 w-4" />}
                label="Berlaku Hingga"
                value={
                  licenseData?.expiresAt
                    ? new Date(licenseData.expiresAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '-'
                }
              />
              <InfoRow
                icon={<Clock className="h-4 w-4" />}
                label="Sisa Hari"
                value={`${licenseData?.daysRemaining || 0} Hari`}
                highlight={!!(licenseData?.daysRemaining && licenseData.daysRemaining < 7)}
              />
              <InfoRow
                icon={<Monitor className="h-4 w-4" />}
                label="Perangkat"
                value={`${licenseData?.activatedDevices || 0}/${licenseData?.maxDevices || 1}`}
              />
            </div>
          </Card>

          {/* Device Info */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Informasi Perangkat</h3>

            <div className="space-y-4">
              <CopyableRow
                icon={<Monitor className="h-4 w-4" />}
                label="Device ID"
                value={licenseClient.getDeviceId()}
                onCopy={() => copyToClipboard(licenseClient.getDeviceId(), 'device')}
                copied={copied === 'device'}
              />
              <InfoRow
                icon={<Server className="h-4 w-4" />}
                label="Platform"
                value={licenseClient.getPlatform().toUpperCase()}
              />
              <InfoRow
                icon={<Zap className="h-4 w-4" />}
                label="App Version"
                value={licenseClient.getAppVersion()}
              />
            </div>
          </Card>

          {/* Connection Info */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Koneksi</h3>
              <div className="flex items-center gap-1.5 text-sm">
                {config.serverTime ? (
                  <>
                    <Wifi className="h-4 w-4 text-emerald-500" />
                    <span className="text-muted-foreground">Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-4 w-4 text-red-500" />
                    <span className="text-muted-foreground">Offline</span>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <CopyableRow
                icon={<Key className="h-4 w-4" />}
                label="License Key"
                value={licenseData?.licenseKey || getStoredLicenseKey() || '-'}
                onCopy={() => copyToClipboard(licenseData?.licenseKey || getStoredLicenseKey() || '', 'license')}
                copied={copied === 'license'}
                masked
              />
              <InfoRow
                icon={<Clock className="h-4 w-4" />}
                label="Sinkronisasi Terakhir"
                value={
                  config.lastSyncedAt
                    ? new Date(config.lastSyncedAt).toLocaleString('id-ID')
                    : '-'
                }
              />
            </div>
          </Card>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <RefreshCw className="h-4 w-4 mr-3 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-3" />
              )}
              Segarkan Lisensi
            </Button>

            <Button
              variant="destructive"
              className="w-full justify-start"
              onClick={() => setDisconnectDialogOpen(true)}
            >
              <Unlink className="h-4 w-4 mr-3" />
              Putuskan Koneksi
            </Button>
          </div>
        </div>
      )}

      {/* Disconnect Dialog */}
      <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Putuskan Koneksi</DialogTitle>
            <DialogDescription>
              Anda yakin ingin memutuskan koneksi? Semua data lisensi akan dihapus dari perangkat ini.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectDialogOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDisconnect}>
              Putuskan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-components
function InfoRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground flex-1">{label}</span>
      <span className={highlight ? 'text-red-500 font-semibold' : ''}>{value}</span>
    </div>
  );
}

function CopyableRow({
  icon,
  label,
  value,
  onCopy,
  copied,
  masked,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
  masked?: boolean;
}) {
  const displayValue = masked && value
    ? `${value.substring(0, 4)}****${value.substring(value.length - 4)}`
    : value;

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground flex-1">{label}</span>
      <span className="font-mono text-xs">{displayValue}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCopy}>
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="h-16 w-16 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20 ml-auto" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
