// License API client — talks to the license-api edge function
const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license-api`;
const PROJECT_API_KEY = 'ksandra_prod_2026';

// ============================================================
// TYPES
// ============================================================

export interface LicenseFeature {
  key: string;
  type: 'boolean' | 'number' | 'string' | 'json';
  value: string | number;
  isMenu?: boolean;
}

export interface LicenseDevice {
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
  packageName: string;
  isActive: boolean;
  lastSeenAt: string;
}

export interface LicenseResponse {
  success: boolean;
  status: string;
  plan: string;
  planName: string;
  licenseKey: string;
  expiresAt: string | null;
  daysRemaining: number;
  maxDevices: number;
  activatedDevices: number;
  device: LicenseDevice | null;
  features: LicenseFeature[];
  message: string;
}

export interface TrialResponse extends LicenseResponse {}

export interface CreateLicenseResponse {
  success: boolean;
  licenseKey: string;
  plan: string;
  expiresAt: string;
  maxDevices: number;
  features: LicenseFeature[];
  message: string;
}

export interface PackageData {
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

export interface PackagesResponse {
  success: boolean;
  project: {
    name: string;
    logo: string | null;
    description: string | null;
  };
  packages: PackageData[];
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface PaymentConfigData {
  payment: {
    manualTransfer: {
      enabled: boolean;
      banks: BankAccount[];
      qrisImage: string | null;
      instructions: string;
      verificationTimeHours: number;
    };
    midtrans: {
      enabled: boolean;
      clientKey: string | null;
      isProduction: boolean;
    };
  };
  currency: string;
  taxRate: number;
}

export interface PaymentConfigResponse {
  success: boolean;
  payment: PaymentConfigData['payment'];
  currency: string;
  taxRate: number;
}

export interface SubscriptionData {
  id: string;
  orderNumber: string;
  packageName: string;
  packageCode: string;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  licenseKey: string | null;
  paidAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface SubscriptionResponse {
  success: boolean;
  subscription: SubscriptionData;
  message?: string;
}

export interface SubscriptionListResponse {
  success: boolean;
  subscriptions: SubscriptionData[];
}

export interface ProjectConfigResponse {
  success: boolean;
  project: {
    name: string;
    isActive: boolean;
  };
  config: {
    forceUpdate: boolean;
    forceUpdateVersion: string | null;
    maintenanceMode: boolean;
    maintenanceMessage: string | null;
    minimumAppVersion: string;
    supportUrl: string | null;
    storeUrl: string | null;
    refreshIntervalMinutes: number;
    offlineValidityHours: number;
  };
}

export interface ConnectResponse {
  success: boolean;
  connected: boolean;
  project: {
    id: string;
    name: string;
    logo: string | null;
    description: string | null;
    currency: string;
    timezone: string;
    supportUrl: string | null;
    maintenanceMode: boolean;
    maintenanceMessage: string | null;
  };
  serverTime: string;
  message: string;
}

// ============================================================
// HELPERS
// ============================================================

function getDeviceId(): string {
  let id = localStorage.getItem('license_device_id');
  if (!id) {
    id = 'web-' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    localStorage.setItem('license_device_id', id);
  }
  return id;
}

function getDeviceName(): string {
  return navigator.userAgent.substring(0, 80) || 'Web Browser';
}

function getPlatform(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'web';
}

function getAppVersion(): string {
  return '3.0.0';
}

function getPackageName(): string {
  return 'com.ksandra.pos';
}

async function postJSON(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${API_BASE}/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getJSON(endpoint: string, params: Record<string, string>): Promise<any> {
  const url = new URL(`${API_BASE}/v1/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { method: 'GET' });
  return res.json();
}

// ============================================================
// API CLIENT
// ============================================================

export const licenseClient = {
  // ---- LICENSE ----
  async getStatus(licenseKey: string): Promise<LicenseResponse> {
    return getJSON('license/status', {
      projectApiKey: PROJECT_API_KEY,
      licenseKey,
      deviceId: getDeviceId(),
    });
  },

  async activate(licenseKey: string): Promise<LicenseResponse> {
    return postJSON('license/activate', {
      projectApiKey: PROJECT_API_KEY,
      licenseKey,
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
      platform: getPlatform(),
      appVersion: getAppVersion(),
      packageName: getPackageName(),
    });
  },

  async check(licenseKey: string): Promise<LicenseResponse> {
    return postJSON('license/check', {
      projectApiKey: PROJECT_API_KEY,
      licenseKey,
      deviceId: getDeviceId(),
      appVersion: getAppVersion(),
    });
  },

  async refresh(licenseKey: string): Promise<LicenseResponse> {
    return postJSON('license/refresh', {
      projectApiKey: PROJECT_API_KEY,
      licenseKey,
      deviceId: getDeviceId(),
    });
  },

  async deactivate(licenseKey: string): Promise<{ success: boolean; message: string }> {
    return postJSON('license/deactivate', {
      projectApiKey: PROJECT_API_KEY,
      licenseKey,
      deviceId: getDeviceId(),
    });
  },

  async createTrial(customerName?: string, customerEmail?: string): Promise<TrialResponse> {
    return postJSON('license/trial', {
      projectApiKey: PROJECT_API_KEY,
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
      platform: getPlatform(),
      appVersion: getAppVersion(),
      packageName: getPackageName(),
      customerName,
      customerEmail,
    });
  },

  async createLicense(planCode: string, secret: string, customerName?: string, customerEmail?: string): Promise<CreateLicenseResponse> {
    return postJSON('license/create', {
      projectApiKey: PROJECT_API_KEY,
      secret,
      planCode,
      customerName,
      customerEmail,
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
      platform: getPlatform(),
      appVersion: getAppVersion(),
      packageName: getPackageName(),
    });
  },

  // ---- PACKAGES ----
  async getPackages(): Promise<PackagesResponse> {
    return getJSON('packages', { projectApiKey: PROJECT_API_KEY });
  },

  // ---- PAYMENT CONFIG ----
  async getPaymentConfig(): Promise<PaymentConfigResponse> {
    return getJSON('payment/config', { projectApiKey: PROJECT_API_KEY });
  },

  // ---- PROJECT CONFIG ----
  async getProjectConfig(): Promise<ProjectConfigResponse> {
    return getJSON('project/config', { projectApiKey: PROJECT_API_KEY });
  },

  // ---- CONNECT ----
  async connect(): Promise<ConnectResponse> {
    return postJSON('connect', { projectApiKey: PROJECT_API_KEY });
  },

  // ---- SUBSCRIPTION ----
  async createSubscription(packageCode: string, paymentMethod: string): Promise<SubscriptionResponse> {
    return postJSON('subscription/create', {
      projectApiKey: PROJECT_API_KEY,
      packageCode,
      paymentMethod,
      deviceId: getDeviceId(),
    });
  },

  async getSubscriptionStatus(orderNumber: string): Promise<SubscriptionResponse> {
    return getJSON('subscription/status', {
      projectApiKey: PROJECT_API_KEY,
      orderNumber,
    });
  },

  async confirmPayment(orderNumber: string): Promise<{ success: boolean; status: string; message: string }> {
    return postJSON('subscription/confirm-payment', {
      projectApiKey: PROJECT_API_KEY,
      orderNumber,
    });
  },

  async getSubscriptionHistory(): Promise<SubscriptionListResponse> {
    return getJSON('subscription/history', {
      projectApiKey: PROJECT_API_KEY,
      deviceId: getDeviceId(),
    });
  },

  // ---- MIDTRANS ----
  async getMidtransToken(orderNumber: string): Promise<{ success: boolean; token?: string; redirectUrl?: string; message?: string }> {
    return postJSON('payment/midtrans/token', {
      projectApiKey: PROJECT_API_KEY,
      orderNumber,
    });
  },

  // ---- HELPERS ----
  getDeviceId,
  getDeviceName,
  getPlatform,
  getAppVersion,
  getPackageName,
};

// ============================================================
// LOCAL HELPERS
// ============================================================

export function getStoredLicenseKey(): string | null {
  return localStorage.getItem('license_key');
}

export function setStoredLicenseKey(key: string): void {
  localStorage.setItem('license_key', key);
}

export function clearStoredLicenseKey(): void {
  localStorage.removeItem('license_key');
}
