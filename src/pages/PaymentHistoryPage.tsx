// Payment History Page - Transaction history with details
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { licenseClient, type SubscriptionData } from '@/lib/license-client';
import {
  Clock, CheckCircle2, X, AlertCircle, CreditCard, Receipt,
  ArrowLeft, ChevronRight, Copy, Building2, Download
} from 'lucide-react';

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function PaymentHistoryPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [selectedSub, setSelectedSub] = useState<SubscriptionData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      // Get subscription history
      const res = await licenseClient.getSubscriptionHistory();
      if (res.success) {
        setSubscriptions(res.subscriptions);
      }
    } catch {
      // Silently fail - show empty state
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = (sub: SubscriptionData) => {
    setSelectedSub(sub);
    setDetailOpen(true);
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
      waiting_payment: { label: 'Menunggu Pembayaran', color: 'text-amber-600', bg: 'bg-amber-500/10', icon: Clock },
      waiting_verification: { label: 'Menunggu Verifikasi', color: 'text-blue-600', bg: 'bg-blue-500/10', icon: Clock },
      paid: { label: 'Berhasil', color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
      verified: { label: 'Terverifikasi', color: 'text-emerald-600', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
      failed: { label: 'Gagal', color: 'text-red-600', bg: 'bg-red-500/10', icon: X },
      expired: { label: 'Kedaluwarsa', color: 'text-red-600', bg: 'bg-red-500/10', icon: AlertCircle },
      cancelled: { label: 'Dibatalkan', color: 'text-gray-600', bg: 'bg-gray-500/10', icon: X },
    };
    return configs[status] || configs.waiting_payment;
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/license')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Riwayat Pembayaran</h1>
            <p className="text-muted-foreground">Lihat semua transaksi Anda</p>
          </div>
        </div>
        <Button variant="outline" onClick={loadHistory} disabled={loading}>
          {loading ? <Clock className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <HistorySkeleton />
      ) : subscriptions.length === 0 ? (
        <EmptyHistoryState onCreateNew={() => navigate('/license')} />
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {subscriptions.map((sub, idx) => {
              const config = getStatusConfig(sub.status);
              return (
                <motion.div
                  key={sub.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card
                    className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => handleViewDetail(sub)}
                  >
                    {/* Mobile view */}
                    <div className="md:hidden space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-10 w-10 rounded-lg ${config.bg} flex items-center justify-center`}>
                            <config.icon className={`h-5 w-5 ${config.color}`} />
                          </div>
                          <div>
                            <p className="font-medium">{sub.packageName}</p>
                            <p className="text-xs text-muted-foreground">{sub.orderNumber}</p>
                          </div>
                        </div>
                        <Badge className={`${config.bg} ${config.color}`}>{config.label}</Badge>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {new Date(sub.createdAt).toLocaleDateString('id-ID')}
                        </span>
                        <span className="font-semibold">
                          Rp {sub.totalAmount.toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>

                    {/* Desktop view */}
                    <div className="hidden md:flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-lg ${config.bg} flex items-center justify-center`}>
                        <Receipt className={`h-6 w-6 ${config.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <p className="font-semibold">{sub.packageName}</p>
                          <Badge className={`${config.bg} ${config.color}`}>{config.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{sub.orderNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">Rp {sub.totalAmount.toLocaleString('id-ID')}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(sub.createdAt).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detail Transaksi</DialogTitle>
          </DialogHeader>
          {selectedSub && (
            <TransactionDetail subscription={selectedSub} onClose={() => setDetailOpen(false)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// TRANSACTION DETAIL
// ============================================================

function TransactionDetail({
  subscription,
  onClose,
}: {
  subscription: SubscriptionData;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const config = {
    waiting_payment: { label: 'Menunggu Pembayaran', color: 'text-amber-600', bg: 'bg-amber-500/10' },
    waiting_verification: { label: 'Menunggu Verifikasi', color: 'text-blue-600', bg: 'bg-blue-500/10' },
    paid: { label: 'Berhasil', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
    verified: { label: 'Terverifikasi', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
    failed: { label: 'Gagal', color: 'text-red-600', bg: 'bg-red-500/10' },
    expired: { label: 'Kedaluwarsa', color: 'text-red-600', bg: 'bg-red-500/10' },
    cancelled: { label: 'Dibatalkan', color: 'text-gray-600', bg: 'bg-gray-500/10' },
  }[subscription.status] || { label: 'Unknown', color: 'text-gray-600', bg: 'bg-gray-500/10' };

  const handleContinue = () => {
    onClose();
    if (subscription.status === 'waiting_payment' || subscription.status === 'expired') {
      navigate(`/payment?order=${subscription.orderNumber}&package=${subscription.packageCode}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className={`text-center p-4 rounded-lg ${config.bg}`}>
        <Badge className={`${config.bg} ${config.color}`}>{config.label}</Badge>
      </div>

      {/* Info */}
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Invoice</span>
          <span className="font-mono">{subscription.orderNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paket</span>
          <span className="font-medium">{subscription.packageName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tanggal</span>
          <span>{new Date(subscription.createdAt).toLocaleDateString('id-ID')}</span>
        </div>
        {subscription.paidAt && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dibayar pada</span>
            <span>{new Date(subscription.paidAt).toLocaleDateString('id-ID')}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Jumlah</span>
          <span>Rp {subscription.amount.toLocaleString('id-ID')}</span>
        </div>
        {subscription.taxAmount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pajak</span>
            <span>Rp {subscription.taxAmount.toLocaleString('id-ID')}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-3 font-semibold">
          <span>Total</span>
          <span>Rp {subscription.totalAmount.toLocaleString('id-ID')}</span>
        </div>
        {subscription.paymentMethod && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Metode</span>
            <span className="flex items-center gap-2">
              {subscription.paymentMethod === 'manual_transfer' ? (
                <>
                  <Building2 className="h-4 w-4" />
                  Transfer Bank
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Midtrans
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* License key if available */}
      {subscription.licenseKey && (
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground mb-1">License Key</p>
          <div className="flex items-center justify-between">
            <span className="font-mono">{subscription.licenseKey}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(subscription.licenseKey!);
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      {(subscription.status === 'waiting_payment' || subscription.status === 'expired') && (
        <Button className="w-full" onClick={handleContinue}>
          Lanjutkan Pembayaran
        </Button>
      )}

      {subscription.status === 'waiting_verification' && (
        <div className="text-center text-sm text-muted-foreground">
          <Clock className="h-5 w-5 mx-auto mb-2 text-blue-500" />
          Pembayaran sedang diverifikasi (maks 24 jam)
        </div>
      )}

      {/* Download invoice */}
      {(subscription.status === 'paid' || subscription.status === 'verified') && (
        <Button variant="outline" className="w-full">
          <Download className="h-4 w-4 mr-2" />
          Download Invoice
        </Button>
      )}
    </div>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyHistoryState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="text-center py-16">
      <div className="h-20 w-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
        <Receipt className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Belum ada transaksi</h2>
      <p className="text-muted-foreground mb-6">
        Anda belum memiliki riwayat pembayaran
      </p>
      <Button onClick={onCreateNew}>Lihat Paket</Button>
    </div>
  );
}

// ============================================================
// SKELETON
// ============================================================

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        </Card>
      ))}
    </div>
  );
}
