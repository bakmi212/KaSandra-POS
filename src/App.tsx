import { useEffect, useState, Suspense, lazy, Component, ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '@/lib/auth-store';
import { usePermissionStore, normalizeRole } from '@/lib/permission-store';
import { fullSync } from '@/lib/sync-engine';
import { onOnlineStatusChange } from '@/lib/offline-store';
import { useAppStore } from '@/lib/app-store';
import { initializeSettings } from '@/lib/settings-store';
import { initializeNotifications } from '@/lib/notification-store';
import { setupGlobalErrorHandler } from '@/lib/logger';
import { useBrandingStore } from '@/lib/branding-store';
import { useRemoteConfigStore } from '@/lib/remote-config-store';
import { setupLicenseSync } from '@/lib/license-sync';
import { initConnectionEngine } from '@/lib/license-connection-engine';
import Layout, { type PageKey } from '@/components/Layout';
import LoginPage from '@/pages/LoginPage';
import PaymentPage from '@/pages/PaymentPage';
import PaymentHistoryPage from '@/pages/PaymentHistoryPage';
import LicenseProfilePage from '@/pages/LicenseProfilePage';
import ProjectIntegrationPage from '@/pages/ProjectIntegrationPage';
import { Loader2 } from 'lucide-react';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const POSPage = lazy(() => import('@/pages/POSPage'));
const ProductsPage = lazy(() => import('@/pages/ProductsPage'));
const CategoriesPage = lazy(() => import('@/pages/CategoriesPage'));
const SuppliersPage = lazy(() => import('@/pages/SuppliersPage'));
const CustomersPage = lazy(() => import('@/pages/CustomersPage'));
const StockPage = lazy(() => import('@/pages/StockPage'));
const PurchasesPage = lazy(() => import('@/pages/PurchasesPage'));
const GoodsReceiptPage = lazy(() => import('@/pages/GoodsReceiptPage'));
const PurchaseReturnsPage = lazy(() => import('@/pages/PurchaseReturnsPage'));
const StockTransfersPage = lazy(() => import('@/pages/StockTransfersPage'));
const BranchesPage = lazy(() => import('@/pages/BranchesPage'));
const FinancePage = lazy(() => import('@/pages/FinancePage'));
const ReportsPage = lazy(() => import('@/pages/ReportsPage'));
const ShiftHistoryPage = lazy(() => import('@/pages/ShiftHistoryPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const StaffPage = lazy(() => import('@/pages/StaffPage'));
const OwnerUsersPage = lazy(() => import('@/pages/OwnerUsersPage'));
const OwnerPermissionsPage = lazy(() => import('@/pages/OwnerPermissionsPage'));
const OwnerIntegrationsPage = lazy(() => import('@/pages/OwnerIntegrationsPage'));
const OwnerNotificationsPage = lazy(() => import('@/pages/OwnerNotificationsPage'));
const OwnerAuditPage = lazy(() => import('@/pages/OwnerAuditPage'));
const LicensePage = lazy(() => import('@/pages/LicensePage'));
const WewenangPage = lazy(() => import('@/pages/WewenangPage'));

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }, { error: string }> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 p-8">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Terjadi kesalahan</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">{this.state.error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium">Muat Ulang</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

function App() {
  const { user, loading, init } = useAuthStore();
  const { hasMenuAccess } = usePermissionStore();
  const { initialize: initApp, isReady } = useAppStore();
  const [page, setPage] = useState<PageKey>('dashboard');

  // Initialize app on mount
  useEffect(() => {
    setupGlobalErrorHandler();
    init();
    initApp();
    initializeSettings();
    initializeNotifications();

    // Sync branding and remote config
    useBrandingStore.getState().syncBranding();
    useRemoteConfigStore.getState().syncConfig();

    // Setup license background sync
    const cleanup = setupLicenseSync();

    // Initialize License Connection Engine (auto-starts if already connected)
    initConnectionEngine();

    return cleanup;
  }, [init, initApp]);

  useEffect(() => {
    const unsub = onOnlineStatusChange((online) => {
      if (online && user) fullSync();
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    if (user) fullSync();
  }, [user]);

  // Show loading screen
  if (loading || !isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Memuat KaSandra Catering...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderPage = () => {
    // owner-staff is always owner-only
    if (page === 'owner-staff' && normalizeRole(user?.role || 'staff') !== 'owner') {
      return <DashboardPage />;
    }

    // owner-permissions is always owner-only
    if (page === 'owner-permissions' && normalizeRole(user?.role || 'staff') !== 'owner') {
      return <DashboardPage />;
    }

    // admin-wewenang is always admin-only
    if (page === 'admin-wewenang' && normalizeRole(user?.role || 'staff') !== 'admin') {
      return <DashboardPage />;
    }

    // Delegable owner pages: Owner always has access, Admin/Staff need permission
    const delegableOwnerPages: PageKey[] = ['owner-users', 'owner-integrations', 'owner-notifications', 'owner-audit', 'owner-license'];
    if (delegableOwnerPages.includes(page)) {
      if (normalizeRole(user?.role || 'staff') === 'owner') {
        // Owner always has access
      } else if (!hasMenuAccess(page)) {
        return <DashboardPage />;
      }
    }

    // Regular menu access check for non-owner users
    if (user && normalizeRole(user.role) !== 'owner' && !hasMenuAccess(page)) {
      return <DashboardPage />;
    }
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'pos': return <POSPage />;
      case 'products': return <ProductsPage />;
      case 'categories': return <CategoriesPage />;
      case 'suppliers': return <SuppliersPage />;
      case 'customers': return <CustomersPage />;
      case 'purchases': return <PurchasesPage />;
      case 'goods-receipt': return <GoodsReceiptPage />;
      case 'purchase-returns': return <PurchaseReturnsPage />;
      case 'stock': return <StockPage />;
      case 'stock-transfers': return <StockTransfersPage />;
      case 'branches': return <BranchesPage />;
      case 'finance': return <FinancePage />;
      case 'reports': return <ReportsPage />;
      case 'shifts': return <ShiftHistoryPage />;
      case 'settings': return <SettingsPage />;
      case 'owner-staff': return <StaffPage />;
      case 'owner-users': return <OwnerUsersPage />;
      case 'owner-permissions': return <OwnerPermissionsPage />;
      case 'owner-integrations': return <OwnerIntegrationsPage />;
      case 'owner-notifications': return <OwnerNotificationsPage />;
      case 'owner-audit': return <OwnerAuditPage />;
      case 'owner-license': return <LicensePage />;
      case 'owner-project-integration': return <ProjectIntegrationPage />;
      case 'admin-wewenang': return <WewenangPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone payment routes (outside layout) */}
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/payment-history" element={<PaymentHistoryPage />} />
        <Route path="/license/profile" element={<LicenseProfilePage />} />
        <Route path="/project/integration" element={<ProjectIntegrationPage />} />

        {/* Main app with layout */}
        <Route path="*" element={
          <ErrorBoundary>
            <Layout current={page} onNavigate={setPage}>
              <Suspense fallback={<PageLoader />}>
                {renderPage()}
              </Suspense>
            </Layout>
          </ErrorBoundary>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
