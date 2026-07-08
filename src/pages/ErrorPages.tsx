// Error Pages - Modern error states for various scenarios
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ServerCrash, WifiOff, KeyRound, CalendarOff, ShieldBan,
  Wrench, DownloadCloud, RefreshCw, ArrowLeft, Home
} from 'lucide-react';

interface ErrorPageProps {
  onRetry?: () => void;
  onGoBack?: () => void;
  onGoHome?: () => void;
}

// Server Offline
export function ServerOfflinePage({ onRetry, onGoBack }: ErrorPageProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center"
      >
        <div className="h-24 w-24 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
          <ServerCrash className="h-12 w-12 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Server Tidak Tersedia</h1>
        <p className="text-muted-foreground mb-6">
          Tidak dapat terhubung ke License Server. Periksa koneksi internet Anda atau coba lagi nanti.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onGoBack && (
            <Button variant="outline" onClick={onGoBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Button>
          )}
          {onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Coba Lagi
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// Connection Failed
export function ConnectionFailedPage({ onRetry, onGoBack }: ErrorPageProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center"
      >
        <div className="h-24 w-24 mx-auto mb-6 rounded-full bg-amber-500/10 flex items-center justify-center">
          <WifiOff className="h-12 w-12 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Koneksi Gagal</h1>
        <p className="text-muted-foreground mb-6">
          Gagal terhubung ke server. Pastikan Server URL dan Connection Key yang Anda masukkan sudah benar.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onGoBack && (
            <Button variant="outline" onClick={onGoBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Button>
          )}
          {onRetry && (
            <Button onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Coba Lagi
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// License Invalid
export function LicenseInvalidPage({ onGoBack }: ErrorPageProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center"
      >
        <div className="h-24 w-24 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
          <KeyRound className="h-12 w-12 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Lisensi Tidak Valid</h1>
        <p className="text-muted-foreground mb-6">
          Lisensi Anda tidak valid atau telah dicabut. Silakan hubungi administrator untuk informasi lebih lanjut.
        </p>
        <div className="flex flex-col gap-3">
          {onGoBack && (
            <Button variant="outline" onClick={onGoBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Button>
          )}
          <Button onClick={() => window.location.href = '/license'}>
            Beli Lisensi Baru
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// Subscription Expired
export function SubscriptionExpiredPage({ onGoBack }: ErrorPageProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center"
      >
        <div className="h-24 w-24 mx-auto mb-6 rounded-full bg-orange-500/10 flex items-center justify-center">
          <CalendarOff className="h-12 w-12 text-orange-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Langganan Kedaluwarsa</h1>
        <p className="text-muted-foreground mb-6">
          Langganan Anda telah berakhir. Perpanjangan diperlukan untuk melanjutkan menggunakan aplikasi.
        </p>
        <div className="flex flex-col gap-3">
          {onGoBack && (
            <Button variant="outline" onClick={onGoBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Button>
          )}
          <Button onClick={() => window.location.href = '/license'}>
            Perpanjang Sekarang
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// Permission Denied
export function PermissionDeniedPage({ onGoBack, onGoHome }: ErrorPageProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center"
      >
        <div className="h-24 w-24 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
          <ShieldBan className="h-12 w-12 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Akses Ditolak</h1>
        <p className="text-muted-foreground mb-6">
          Anda tidak memiliki izin untuk mengakses halaman ini. Hubungi administrator untuk meminta akses.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onGoBack && (
            <Button variant="outline" onClick={onGoBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Button>
          )}
          {onGoHome && (
            <Button onClick={onGoHome}>
              <Home className="h-4 w-4 mr-2" />
              Ke Dashboard
            </Button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// Maintenance Mode
export function MaintenancePage({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-b from-background to-muted/20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center"
      >
        <Card className="p-8">
          <div className="h-24 w-24 mx-auto mb-6 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Wrench className="h-12 w-12 text-blue-500 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Server Sedang Maintenance</h1>
          <p className="text-muted-foreground mb-4">
            {message || 'Server sedang dalam proses pemeliharaan. Silakan coba lagi nanti.'}
          </p>
          <p className="text-sm text-muted-foreground">
            Anda akan diarahkan secara otomatis setelah maintenance selesai.
          </p>
        </Card>
      </motion.div>
    </div>
  );
}

// Update Required
export function UpdateRequiredPage({ currentVersion, requiredVersion, onUpdate }: {
  currentVersion: string;
  requiredVersion: string;
  onUpdate?: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-b from-background to-muted/20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center"
      >
        <Card className="p-8">
          <div className="h-24 w-24 mx-auto mb-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <DownloadCloud className="h-12 w-12 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Update Tersedia</h1>
          <p className="text-muted-foreground mb-4">
            Versi {requiredVersion} diperlukan. Anda saat ini menggunakan versi {currentVersion}.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Update aplikasi untuk melanjutkan.
          </p>
          <Button className="w-full" onClick={onUpdate || (() => window.location.reload())}>
            <DownloadCloud className="h-4 w-4 mr-2" />
            Update Sekarang
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}

// Offline License Expired
export function OfflineLicenseExpiredPage({ onRetry }: ErrorPageProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md text-center"
      >
        <div className="h-24 w-24 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
          <WifiOff className="h-12 w-12 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Offline License Kedaluwarsa</h1>
        <p className="text-muted-foreground mb-6">
          Periode offline license telah berakhir. Sambungkan ke internet untuk memperbarui lisensi Anda.
        </p>
        <Button onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Coba Sinkronkan
        </Button>
      </motion.div>
    </div>
  );
}
