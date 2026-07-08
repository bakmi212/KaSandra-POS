// Payment Page - Modern payment flow with auto-refresh
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  licenseClient,
  type PackageData,
  type PaymentConfigData,
  type SubscriptionData,
  getStoredLicenseKey,
  setStoredLicenseKey,
} from '@/lib/license-client';
import {
  Check, Copy, Building2, CreditCard, ChevronRight, Clock, AlertCircle,
  CheckCircle2, Loader2, ArrowLeft, Monitor, ShieldCheck, X,
  Download, Info, RefreshCw
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

type PaymentStep = 'summary' | 'method' | 'process' | 'success' | 'failed';

interface PaymentProgress {
  step: number;
  label: string;
  status: 'pending' | 'loading' | 'done' | 'error';
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function PaymentPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const packageCode = searchParams.get('package');
  const orderNumber = searchParams.get('order');

  // State
  const [loading, setLoading] = useState(true);
  const [pkg, setPkg] = useState<PackageData | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfigData | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<PaymentStep>('summary');
  const [copiedBank, setCopiedBank] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        // If orderNumber exists, load subscription status
        if (orderNumber) {
          const statusRes = await licenseClient.getSubscriptionStatus(orderNumber);
          if (statusRes.success) {
            setSubscription(statusRes.subscription);
            // Determine step based on status
            if (statusRes.subscription.status === 'paid' || statusRes.subscription.status === 'verified') {
              setStep('success');
            } else if (statusRes.subscription.status === 'failed' || statusRes.subscription.status === 'cancelled') {
              setStep('failed');
            } else {
              setStep('method');
            }
          }
        }

        // Load packages
        const packagesRes = await licenseClient.getPackages();
        if (packagesRes.success && packageCode) {
          const foundPkg = packagesRes.packages.find(p => p.code === packageCode);
          if (foundPkg) setPkg(foundPkg);
        }

        // Load payment config
        const paymentRes = await licenseClient.getPaymentConfig();
        if (paymentRes.success) {
          setPaymentConfig(paymentRes);
          // Auto-select first available method
          const methods = getAvailableMethods(paymentRes);
          if (methods.length > 0) setSelectedMethod(methods[0]);
        }

        setLoading(false);
      } catch {
        toast({ title: 'Gagal memuat data', variant: 'destructive' });
        setLoading(false);
      }
    };

    loadData();
  }, [packageCode, orderNumber, toast]);

  // Get available payment methods
  const getAvailableMethods = (config: PaymentConfigData | null): string[] => {
    if (!config) return [];
    const methods: string[] = [];
    if (config.payment.manualTransfer.enabled) methods.push('manual_transfer');
    if (config.payment.midtrans.enabled) methods.push('midtrans');
    return methods;
  };

  // Create subscription
  const handleCreateSubscription = async () => {
    if (!pkg || !selectedMethod) return;

    setProcessing(true);
    try {
      const res = await licenseClient.createSubscription(pkg.code, selectedMethod);
      if (res.success) {
        setSubscription(res.subscription);
        setStep('process');

        if (selectedMethod === 'midtrans') {
          // Get Midtrans token and redirect
          const tokenRes = await licenseClient.getMidtransToken(res.subscription.orderNumber);
          if (tokenRes.success && tokenRes.redirectUrl) {
            // Open Midtrans in new window or redirect
            window.open(tokenRes.redirectUrl, '_blank');

            // Poll for payment status
            pollPaymentStatus(res.subscription.orderNumber);
          }
        }
      } else {
        toast({ title: res.message || 'Gagal membuat pesanan', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Terjadi kesalahan', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  // Poll payment status
  const pollPaymentStatus = async (orderNum: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes

    const poll = async () => {
      if (attempts >= maxAttempts) return;

      try {
        const res = await licenseClient.getSubscriptionStatus(orderNum);
        if (res.success) {
          setSubscription(res.subscription);

          if (res.subscription.status === 'paid' || res.subscription.status === 'verified') {
            await handlePaymentSuccess(res.subscription);
            return;
          }

          if (res.subscription.status === 'failed' || res.subscription.status === 'cancelled') {
            setStep('failed');
            return;
          }
        }
      } catch {}

      attempts++;
      setTimeout(poll, 5000);
    };

    poll();
  };

  // Confirm manual payment
  const handleConfirmPayment = async () => {
    if (!subscription) return;

    setProcessing(true);
    try {
      const res = await licenseClient.confirmPayment(subscription.orderNumber);
      if (res.success) {
        setSubscription(prev => prev ? { ...prev, status: 'waiting_verification' } : null);
        toast({
          title: 'Pembayaran terkonfirmasi',
          description: 'Verifikasi dalam 1x24 jam'
        });

        // Navigate to success with waiting state
        setTimeout(() => {
          navigate('/license?tab=history');
        }, 2000);
      }
    } catch {
      toast({ title: 'Terjadi kesalahan', variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  // Handle payment success
  const handlePaymentSuccess = async (sub: SubscriptionData) => {
    setStep('success');

    // If license key is returned, save it
    if (sub.licenseKey) {
      setStoredLicenseKey(sub.licenseKey);
    }

    // Refresh license to update sidebar/permissions
    await autoRefreshLicense();

    // Navigate to license page after success
    setTimeout(() => {
      navigate('/license');
    }, 3000);
  };

  // Auto-refresh license
  const autoRefreshLicense = async () => {
    const storedKey = getStoredLicenseKey();
    if (!storedKey) return;

    try {
      await licenseClient.refresh(storedKey);
      // This will trigger app-wide state update via license-client
    } catch {}
  };

  // Copy bank account
  const copyToClipboard = (text: string, bank: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBank(bank);
    toast({ title: 'Nomor rekening disalin' });
    setTimeout(() => setCopiedBank(null), 2000);
  };

  // Render
  if (loading) {
    return <LoadingSkeleton />;
  }

  if (!pkg) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">Paket tidak ditemukan</h2>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/license')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kembali
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back button */}
      <Button variant="ghost" className="mb-6" onClick={() => navigate('/license')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Kembali ke Lisensi
      </Button>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Left: Main content */}
        <div className="lg:col-span-3 space-y-6">
          <AnimatePresence mode="wait">
            {step === 'summary' && (
              <motion.div
                key="summary"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <PackageSummaryCard pkg={pkg} />

                <div className="mt-6">
                  <PaymentMethodSelector
                    config={paymentConfig}
                    selectedMethod={selectedMethod}
                    onMethodSelect={setSelectedMethod}
                  />
                </div>

                <Button
                  className="w-full mt-6"
                  size="lg"
                  disabled={!selectedMethod || processing}
                  onClick={handleCreateSubscription}
                >
                  {processing ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <ChevronRight className="h-5 w-5 mr-2" />
                  )}
                  Lanjutkan Pembayaran
                </Button>
              </motion.div>
            )}

            {step === 'method' && subscription && (
              <motion.div
                key="method"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <SubscriptionInfoCard subscription={subscription} />

                {subscription.status === 'waiting_payment' && selectedMethod === 'manual_transfer' && paymentConfig && (
                  <ManualTransferCard
                    config={paymentConfig}
                    copiedBank={copiedBank}
                    onCopy={copyToClipboard}
                    onConfirm={handleConfirmPayment}
                    processing={processing}
                  />
                )}

                {subscription.status === 'waiting_verification' && (
                  <WaitingVerificationCard />
                )}
              </motion.div>
            )}

            {step === 'success' && subscription && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <PaymentSuccessCard subscription={subscription} />
              </motion.div>
            )}

            {step === 'failed' && (
              <motion.div
                key="failed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <PaymentFailedCard onRetry={() => setStep('summary')} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Order info */}
        <div className="lg:col-span-2">
          <div className="sticky top-4 space-y-4">
            <OrderInfoCard pkg={pkg} method={selectedMethod} subscription={subscription} />

            {/* Security note */}
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">Pembayaran Aman</p>
                  <p className="text-xs text-muted-foreground">
                    Data Anda terlindungi enkripsi dan proses verifikasi otomatis
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function PackageSummaryCard({ pkg }: { pkg: PackageData }) {
  const labelConfig: Record<string, { label: string; bg: string }> = {
    best_seller: { label: 'Best Seller', bg: 'bg-blue-500' },
    recommended: { label: 'Recommended', bg: 'bg-emerald-500' },
    popular: { label: 'Popular', bg: 'bg-orange-500' },
    premium: { label: 'Premium', bg: 'bg-purple-500' },
  };

  const label = pkg.label ? labelConfig[pkg.label] : null;

  return (
    <Card className="overflow-hidden">
      <div className="p-6 bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">KaSandra POS</span>
            </div>
            <h2 className="text-2xl font-bold mt-2">{pkg.name}</h2>
            {label && (
              <Badge className={`mt-2 ${label.bg} text-white`}>{label.label}</Badge>
            )}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">Rp {pkg.price.toLocaleString('id-ID')}</p>
            <p className="text-sm text-muted-foreground">/{pkg.durationDays} hari</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Monitor className="h-4 w-4" />
            {pkg.maxDevices} perangkat
          </span>
          <span>•</span>
          <span>{pkg.durationDays} hari</span>
        </div>
      </div>

      <div className="p-6 border-t">
        <p className="text-sm font-medium mb-3">Yang Anda Dapatkan</p>
        <div className="grid grid-cols-2 gap-2">
          {pkg.menuPermissions.slice(0, 8).map((perm) => (
            <div key={perm} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-emerald-500" />
              <span>{perm}</span>
            </div>
          ))}
        </div>
        {pkg.menuPermissions.length > 8 && (
          <p className="text-xs text-muted-foreground mt-2">
            +{pkg.menuPermissions.length - 8} fitur lainnya
          </p>
        )}
      </div>
    </Card>
  );
}

function PaymentMethodSelector({
  config,
  selectedMethod,
  onMethodSelect,
}: {
  config: PaymentConfigData | null;
  selectedMethod: string | null;
  onMethodSelect: (method: string) => void;
}) {
  if (!config) return null;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Metode Pembayaran</h3>

      {config.payment.manualTransfer.enabled && (
        <button
          onClick={() => onMethodSelect('manual_transfer')}
          className={`w-full p-4 rounded-xl border text-left transition-all ${
            selectedMethod === 'manual_transfer'
              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
              : 'hover:border-primary/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Transfer Bank</p>
              <p className="text-xs text-muted-foreground">
                Verifikasi manual 1x24 jam
              </p>
            </div>
            <ChevronRight className={`h-5 w-5 transition-transform ${selectedMethod === 'manual_transfer' ? 'rotate-90' : ''}`} />
          </div>
        </button>
      )}

      {config.payment.midtrans.enabled && (
        <button
          onClick={() => onMethodSelect('midtrans')}
          className={`w-full p-4 rounded-xl border text-left transition-all ${
            selectedMethod === 'midtrans'
              ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
              : 'hover:border-primary/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">Midtrans</p>
                <Badge variant="secondary" className="text-xs">Otomatis</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                VISA, Mastercard, QRIS, E-Wallet
              </p>
            </div>
            <ChevronRight className={`h-5 w-5 transition-transform ${selectedMethod === 'midtrans' ? 'rotate-90' : ''}`} />
          </div>
        </button>
      )}
    </div>
  );
}

function ManualTransferCard({
  config,
  copiedBank,
  onCopy,
  onConfirm,
  processing,
}: {
  config: PaymentConfigData;
  copiedBank: string | null;
  onCopy: (text: string, bank: string) => void;
  onConfirm: () => void;
  processing: boolean;
}) {
  return (
    <Card className="mt-6 p-6 space-y-6">
      <div className="flex items-center gap-2 text-amber-600 bg-amber-500/10 p-3 rounded-lg">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm font-medium">Transfer ke rekening berikut</span>
      </div>

      {config.payment.manualTransfer.banks.map((bank) => (
        <div key={bank.bankName} className="rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">{bank.bankName}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCopy(bank.accountNumber, bank.bankName)}
            >
              {copiedBank === bank.bankName ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-2xl font-mono font-bold tracking-wide">
            {bank.accountNumber}
          </p>
          <p className="text-sm text-muted-foreground">a.n. {bank.accountName}</p>
        </div>
      ))}

      {config.payment.manualTransfer.qrisImage && (
        <div className="text-center border-t pt-6">
          <p className="text-sm text-muted-foreground mb-3">Atau scan QRIS</p>
          <img
            src={config.payment.manualTransfer.qrisImage}
            alt="QRIS"
            className="mx-auto rounded-xl max-w-[180px]"
          />
          <Button variant="outline" size="sm" className="mt-3">
            <Download className="h-4 w-4 mr-2" />
            Download QRIS
          </Button>
        </div>
      )}

      <div className="border-t pt-4 space-y-2">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5" />
          <p className="text-sm text-muted-foreground">
            {config.payment.manualTransfer.instructions}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>Verifikasi dalam {config.payment.manualTransfer.verificationTimeHours} jam</span>
        </div>
      </div>

      <Button className="w-full" size="lg" onClick={onConfirm} disabled={processing}>
        {processing ? (
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
        ) : (
          <CheckCircle2 className="h-5 w-5 mr-2" />
        )}
        Saya Sudah Transfer
      </Button>
    </Card>
  );
}

function SubscriptionInfoCard({ subscription }: { subscription: SubscriptionData }) {
  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    waiting_payment: { label: 'Menunggu Pembayaran', color: 'text-amber-600', bg: 'bg-amber-500/10' },
    waiting_verification: { label: 'Menunggu Verifikasi', color: 'text-blue-600', bg: 'bg-blue-500/10' },
    paid: { label: 'Pembayaran Berhasil', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
    verified: { label: 'Terverifikasi', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
    failed: { label: 'Gagal', color: 'text-red-600', bg: 'bg-red-500/10' },
    expired: { label: 'Kedaluwarsa', color: 'text-red-600', bg: 'bg-red-500/10' },
    cancelled: { label: 'Dibatalkan', color: 'text-gray-600', bg: 'bg-gray-500/10' },
  };

  const config = statusConfig[subscription.status] || statusConfig.waiting_payment;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Status Pembayaran</h3>
        <Badge className={`${config.bg} ${config.color}`}>{config.label}</Badge>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Invoice</span>
          <span className="font-mono">{subscription.orderNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paket</span>
          <span>{subscription.packageName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold">Rp {subscription.totalAmount.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Berlaku hingga</span>
          <span>{new Date(subscription.expiresAt).toLocaleDateString('id-ID')}</span>
        </div>
      </div>
    </Card>
  );
}

function WaitingVerificationCard() {
  return (
    <Card className="p-6 text-center">
      <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
        <Clock className="h-8 w-8 text-blue-500" />
      </div>
      <h3 className="font-semibold text-lg">Menunggu Verifikasi</h3>
      <p className="text-muted-foreground mt-2">
        Pembayaran Anda sedang diverifikasi. Proses ini membutuhkan waktu maksimal 1x24 jam.
      </p>
      <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Cek Status
      </Button>
    </Card>
  );
}

function PaymentSuccessCard({ subscription }: { subscription: SubscriptionData }) {
  const [progress, setProgress] = useState<PaymentProgress[]>([
    { step: 1, label: 'Memverifikasi pembayaran...', status: 'loading' },
    { step: 2, label: 'Mengaktifkan lisensi...', status: 'pending' },
    { step: 3, label: 'Mengunduh konfigurasi...', status: 'pending' },
    { step: 4, label: 'Memperbarui menu...', status: 'pending' },
  ]);

  useEffect(() => {
    const simulateProgress = async () => {
      await new Promise(r => setTimeout(r, 800));
      setProgress(prev => prev.map(p => p.step === 1 ? { ...p, status: 'done' } : p));
      setProgress(prev => prev.map(p => p.step === 2 ? { ...p, status: 'loading' } : p));

      await new Promise(r => setTimeout(r, 600));
      setProgress(prev => prev.map(p => p.step === 2 ? { ...p, status: 'done' } : p));
      setProgress(prev => prev.map(p => p.step === 3 ? { ...p, status: 'loading' } : p));

      await new Promise(r => setTimeout(r, 500));
      setProgress(prev => prev.map(p => p.step === 3 ? { ...p, status: 'done' } : p));
      setProgress(prev => prev.map(p => p.step === 4 ? { ...p, status: 'loading' } : p));

      await new Promise(r => setTimeout(r, 400));
      setProgress(prev => prev.map(p => p.step === 4 ? { ...p, status: 'done' } : p));
    };

    simulateProgress();
  }, []);

  return (
    <Card className="p-8 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', duration: 0.5 }}
        className="h-20 w-20 mx-auto mb-6 rounded-full bg-emerald-500/10 flex items-center justify-center"
      >
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
      </motion.div>

      <h2 className="text-2xl font-bold mb-2">Pembayaran Berhasil</h2>
      <p className="text-muted-foreground mb-6">
        Terima kasih! Lisensi Anda sedang diaktifkan.
      </p>

      <div className="text-left space-y-3 mb-6">
        {progress.map((p) => (
          <div key={p.step} className="flex items-center gap-3">
            <div className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0">
              {p.status === 'done' && <Check className="h-4 w-4 text-emerald-500" />}
              {p.status === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {p.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-muted" />}
              {p.status === 'error' && <X className="h-4 w-4 text-red-500" />}
            </div>
            <span className={p.status === 'done' ? 'text-emerald-600' : 'text-muted-foreground'}>
              {p.label}
            </span>
          </div>
        ))}
      </div>

      <div className="p-4 bg-muted/50 rounded-lg">
        <p className="text-xs text-muted-foreground">License Key</p>
        <p className="font-mono text-lg mt-1">{subscription.licenseKey || 'Memproses...'}</p>
      </div>

      <Progress value={progress.filter(p => p.status === 'done').length * 25} className="mt-6" />
    </Card>
  );
}

function PaymentFailedCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="p-8 text-center">
      <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
        <X className="h-8 w-8 text-red-500" />
      </div>
      <h3 className="font-semibold text-lg">Pembayaran Gagal</h3>
      <p className="text-muted-foreground mt-2">
        Transaksi tidak dapat diselesaikan. Silakan coba lagi atau pilih metode pembayaran lain.
      </p>
      <Button className="mt-4" onClick={onRetry}>
        Coba Lagi
      </Button>
    </Card>
  );
}

function OrderInfoCard({
  pkg,
  method,
  subscription,
}: {
  pkg: PackageData;
  method: string | null;
  subscription: SubscriptionData | null;
}) {
  const subtotal = pkg.price;
  const tax = Math.round(subtotal * 0.11); // PPN 11%
  const total = subtotal + tax;

  return (
    <Card className="p-6">
      <h3 className="font-semibold mb-4">Ringkasan Pesanan</h3>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{pkg.name}</span>
          <span>Rp {subtotal.toLocaleString('id-ID')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Pajak (PPN 11%)</span>
          <span>Rp {tax.toLocaleString('id-ID')}</span>
        </div>
        <div className="border-t pt-3 flex justify-between font-semibold">
          <span>Total</span>
          <span className="text-lg">Rp {total.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {method && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground">Metode Pembayaran</p>
          <p className="font-medium">
            {method === 'manual_transfer' ? 'Transfer Bank' : 'Midtrans'}
          </p>
        </div>
      )}

      {subscription && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground">Invoice</p>
          <p className="font-mono text-sm">{subscription.orderNumber}</p>
        </div>
      )}
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="h-10 w-40 bg-muted rounded animate-pulse" />
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <div className="h-64 bg-muted rounded-xl animate-pulse" />
          <div className="h-40 bg-muted rounded-xl animate-pulse" />
        </div>
        <div className="lg:col-span-2">
          <div className="h-80 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}
