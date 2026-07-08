import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash, createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Simple rate limiting via in-memory map (per-worker)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateLicenseKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let seg = "";
    for (let i = 0; i < 4; i++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(seg);
  }
  return segments.join("-");
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

interface RequestBody {
  projectApiKey?: string;
  licenseKey?: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
  packageName?: string;
  customerName?: string;
  customerEmail?: string;
  planCode?: string;
}

async function validateProject(apiKey: string) {
  const { data, error } = await supabase
    .from("license_projects")
    .select("*")
    .eq("api_key_hash", apiKey)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getLicenseWithPlan(licenseKey: string, projectId: string) {
  const { data, error } = await supabase
    .from("licenses")
    .select(`
      *,
      plan:license_plans(*),
      devices:license_devices(*)
    `)
    .eq("license_key", licenseKey)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function getFeatures(planId: string) {
  const { data } = await supabase
    .from("license_features")
    .select("feature_key, feature_type, feature_value")
    .eq("plan_id", planId);
  return data || [];
}

function buildFeaturesArray(features: any[]) {
  return features.map((f) => ({
    key: f.feature_key,
    type: f.feature_type,
    value: f.feature_type === "number" ? Number(f.feature_value) : f.feature_value,
  }));
}

function buildDeviceObject(device: any) {
  if (!device) return null;
  return {
    deviceId: device.device_id,
    deviceName: device.device_name || "",
    platform: device.platform || "",
    appVersion: device.app_version || "",
    packageName: device.package_name || "",
    isActive: device.is_active,
    lastSeenAt: device.last_seen_at,
  };
}

function buildLicenseResponse(license: any, features: any[], device: any = null) {
  const now = new Date();
  const expiresAt = license.expires_at ? new Date(license.expires_at) : null;
  const daysRemaining = expiresAt ? Math.max(0, daysBetween(now, expiresAt)) : 0;

  let status = license.status;
  if (status === "active" && expiresAt && expiresAt < now) {
    status = "expired";
  }

  return {
    success: true,
    status,
    plan: license.plan?.code || "unknown",
    planName: license.plan?.name || "Unknown",
    licenseKey: license.license_key,
    expiresAt: license.expires_at || null,
    daysRemaining,
    maxDevices: license.max_devices,
    activatedDevices: license.activated_devices,
    device: buildDeviceObject(device),
    features: buildFeaturesArray(features),
    message: "OK",
  };
}

// ============================================================
// API ENDPOINTS
// ============================================================

// GET /license-api/v1/license/status?projectApiKey=...&licenseKey=...&deviceId=...
async function handleStatus(req: Request, url: URL): Promise<Response> {
  const projectApiKey = url.searchParams.get("projectApiKey");
  const licenseKey = url.searchParams.get("licenseKey");
  const deviceId = url.searchParams.get("deviceId");

  if (!projectApiKey || !licenseKey) {
    return json({ success: false, message: "projectApiKey and licenseKey are required" }, 400);
  }

  if (!checkRateLimit(projectApiKey + ":" + (deviceId || ""))) {
    return json({ success: false, message: "Rate limit exceeded" }, 429);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const license = await getLicenseWithPlan(licenseKey, project.id);
  if (!license) return json({ success: false, message: "License not found" }, 404);

  // Find device if deviceId provided
  let device = null;
  if (deviceId) {
    device = (license.devices || []).find((d: any) => d.device_id === deviceId && d.is_active);
  }

  const features = await getFeatures(license.plan_id);

  // Update last_check_at
  await supabase.from("licenses").update({ last_check_at: new Date().toISOString() }).eq("id", license.id);

  // Update device last_seen if found
  if (device) {
    await supabase.from("license_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  }

  return json(buildLicenseResponse(license, features, device));
}

// POST /license-api/v1/license/activate
async function handleActivate(body: RequestBody): Promise<Response> {
  const { projectApiKey, licenseKey, deviceId, deviceName, platform, appVersion, packageName } = body;

  if (!projectApiKey || !licenseKey || !deviceId) {
    return json({ success: false, message: "projectApiKey, licenseKey, and deviceId are required" }, 400);
  }

  if (!checkRateLimit(projectApiKey + ":" + deviceId)) {
    return json({ success: false, message: "Rate limit exceeded" }, 429);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const license = await getLicenseWithPlan(licenseKey, project.id);
  if (!license) return json({ success: false, message: "License not found" }, 404);

  if (license.status === "revoked" || license.status === "suspended") {
    return json({ success: false, message: `License is ${license.status}` }, 403);
  }

  // Check if already expired
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    await supabase.from("licenses").update({ status: "expired" }).eq("id", license.id);
    return json({ success: false, message: "License has expired" }, 403);
  }

  // Check if device already registered
  const existingDevice = (license.devices || []).find((d: any) => d.device_id === deviceId);

  if (existingDevice) {
    if (!existingDevice.is_active) {
      return json({ success: false, message: "Device is deactivated. Use device/reset to re-register." }, 403);
    }
    // Update last seen
    await supabase.from("license_devices").update({
      last_seen_at: new Date().toISOString(),
      device_name: deviceName || existingDevice.device_name,
      app_version: appVersion || existingDevice.app_version,
    }).eq("id", existingDevice.id);
  } else {
    // New device — check device limit
    const activeDevices = (license.devices || []).filter((d: any) => d.is_active).length;
    if (activeDevices >= license.max_devices) {
      return json({
        success: false,
        message: `Device limit reached (${license.max_devices}). Deactivate a device first.`,
      }, 403);
    }

    // Register new device
    const { data: newDevice, error: devError } = await supabase.from("license_devices").insert({
      license_id: license.id,
      device_id: deviceId,
      device_name: deviceName || null,
      platform: platform || null,
      app_version: appVersion || null,
      package_name: packageName || null,
      is_active: true,
    }).select("*").maybeSingle();

    if (devError) return json({ success: false, message: "Failed to register device" }, 500);

    // Update activated_devices count
    await supabase.from("licenses").update({
      activated_devices: activeDevices + 1,
      status: "active",
      activated_at: license.activated_at || new Date().toISOString(),
    }).eq("id", license.id);
  }

  // Re-fetch license
  const updatedLicense = await getLicenseWithPlan(licenseKey, project.id);
  const features = await getFeatures(updatedLicense.plan_id);
  const device = (updatedLicense.devices || []).find((d: any) => d.device_id === deviceId);

  return json({
    ...buildLicenseResponse(updatedLicense, features, device),
    message: "License activated successfully",
  });
}

// POST /license-api/v1/license/check
async function handleCheck(body: RequestBody): Promise<Response> {
  const { projectApiKey, licenseKey, deviceId, appVersion } = body;

  if (!projectApiKey || !licenseKey || !deviceId) {
    return json({ success: false, message: "projectApiKey, licenseKey, and deviceId are required" }, 400);
  }

  if (!checkRateLimit(projectApiKey + ":" + deviceId)) {
    return json({ success: false, message: "Rate limit exceeded" }, 429);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const license = await getLicenseWithPlan(licenseKey, project.id);
  if (!license) return json({ success: false, message: "License not found" }, 404);

  // Verify device is registered
  const device = (license.devices || []).find((d: any) => d.device_id === deviceId);
  if (!device || !device.is_active) {
    return json({ success: false, message: "Device not registered or deactivated" }, 403);
  }

  // Check expiry
  let status = license.status;
  if (status === "active" && license.expires_at && new Date(license.expires_at) < new Date()) {
    status = "expired";
    await supabase.from("licenses").update({ status: "expired" }).eq("id", license.id);
  }

  // Update last_check_at and device last_seen
  await supabase.from("licenses").update({ last_check_at: new Date().toISOString() }).eq("id", license.id);
  await supabase.from("license_devices").update({
    last_seen_at: new Date().toISOString(),
    app_version: appVersion || device.app_version,
  }).eq("id", device.id);

  const features = await getFeatures(license.plan_id);

  return json({
    ...buildLicenseResponse({ ...license, status }, features, device),
    message: "License check completed",
  });
}

// POST /license-api/v1/license/refresh
async function handleRefresh(body: RequestBody): Promise<Response> {
  const { projectApiKey, licenseKey, deviceId } = body;

  if (!projectApiKey || !licenseKey || !deviceId) {
    return json({ success: false, message: "projectApiKey, licenseKey, and deviceId are required" }, 400);
  }

  if (!checkRateLimit(projectApiKey + ":" + deviceId)) {
    return json({ success: false, message: "Rate limit exceeded" }, 429);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const license = await getLicenseWithPlan(licenseKey, project.id);
  if (!license) return json({ success: false, message: "License not found" }, 404);

  const device = (license.devices || []).find((d: any) => d.device_id === deviceId);
  if (!device || !device.is_active) {
    return json({ success: false, message: "Device not registered or deactivated" }, 403);
  }

  // Update timestamps
  await supabase.from("licenses").update({ last_check_at: new Date().toISOString() }).eq("id", license.id);
  await supabase.from("license_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);

  const features = await getFeatures(license.plan_id);

  return json({
    ...buildLicenseResponse(license, features, device),
    message: "License refreshed",
  });
}

// POST /license-api/v1/license/deactivate
async function handleDeactivate(body: RequestBody): Promise<Response> {
  const { projectApiKey, licenseKey, deviceId } = body;

  if (!projectApiKey || !licenseKey || !deviceId) {
    return json({ success: false, message: "projectApiKey, licenseKey, and deviceId are required" }, 400);
  }

  if (!checkRateLimit(projectApiKey + ":" + deviceId)) {
    return json({ success: false, message: "Rate limit exceeded" }, 429);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const license = await getLicenseWithPlan(licenseKey, project.id);
  if (!license) return json({ success: false, message: "License not found" }, 404);

  const device = (license.devices || []).find((d: any) => d.device_id === deviceId);
  if (!device) {
    return json({ success: false, message: "Device not found" }, 404);
  }

  // Deactivate device
  await supabase.from("license_devices").update({ is_active: false }).eq("id", device.id);

  // Update activated_devices count
  const activeCount = (license.devices || []).filter((d: any) => d.is_active && d.device_id !== deviceId).length;
  await supabase.from("licenses").update({ activated_devices: activeCount }).eq("id", license.id);

  return json({
    success: true,
    message: "Device deactivated successfully",
  });
}

// POST /license-api/v1/device/register
async function handleDeviceRegister(body: RequestBody): Promise<Response> {
  const { projectApiKey, licenseKey, deviceId, deviceName, platform, appVersion, packageName } = body;

  if (!projectApiKey || !licenseKey || !deviceId) {
    return json({ success: false, message: "projectApiKey, licenseKey, and deviceId are required" }, 400);
  }

  // Reuse activate logic
  return handleActivate(body);
}

// POST /license-api/v1/device/reset
async function handleDeviceReset(body: RequestBody): Promise<Response> {
  const { projectApiKey, licenseKey, deviceId } = body;

  if (!projectApiKey || !licenseKey || !deviceId) {
    return json({ success: false, message: "projectApiKey, licenseKey, and deviceId are required" }, 400);
  }

  if (!checkRateLimit(projectApiKey + ":" + deviceId)) {
    return json({ success: false, message: "Rate limit exceeded" }, 429);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const license = await getLicenseWithPlan(licenseKey, project.id);
  if (!license) return json({ success: false, message: "License not found" }, 404);

  const device = (license.devices || []).find((d: any) => d.device_id === deviceId);
  if (!device) {
    return json({ success: false, message: "Device not found" }, 404);
  }

  // Reset: re-activate the device
  await supabase.from("license_devices").update({
    is_active: true,
    last_seen_at: new Date().toISOString(),
  }).eq("id", device.id);

  // Update activated_devices count
  const activeCount = (license.devices || []).filter((d: any) => d.is_active || d.device_id === deviceId).length;
  await supabase.from("licenses").update({
    activated_devices: activeCount,
    status: "active",
  }).eq("id", license.id);

  const features = await getFeatures(license.plan_id);
  const updatedDevice = { ...device, is_active: true };

  return json({
    ...buildLicenseResponse(license, features, updatedDevice),
    message: "Device reset successfully",
  });
}

// POST /license-api/v1/license/create (admin: create new license key)
async function handleCreateLicense(body: RequestBody & { secret?: string }): Promise<Response> {
  const { projectApiKey, secret, planCode, customerName, customerEmail, deviceId, deviceName, platform, appVersion, packageName } = body;

  if (!projectApiKey || !secret || !planCode) {
    return json({ success: false, message: "projectApiKey, secret, and planCode are required" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  // Verify secret
  if (secret !== project.secret_hash) {
    return json({ success: false, message: "Invalid secret" }, 403);
  }

  // Find plan
  const { data: plan, error: planError } = await supabase
    .from("license_plans")
    .select("*")
    .eq("project_id", project.id)
    .eq("code", planCode)
    .eq("is_active", true)
    .maybeSingle();

  if (planError || !plan) return json({ success: false, message: "Plan not found" }, 404);

  // Generate license key
  const licenseKey = generateLicenseKey();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

  const { data: license, error: licError } = await supabase.from("licenses").insert({
    project_id: project.id,
    plan_id: plan.id,
    license_key: licenseKey,
    status: "inactive",
    customer_name: customerName || null,
    customer_email: customerEmail || null,
    max_devices: plan.max_devices,
    expires_at: expiresAt.toISOString(),
  }).select("*").maybeSingle();

  if (licError || !license) return json({ success: false, message: "Failed to create license" }, 500);

  // If deviceId provided, activate immediately
  let device = null;
  if (deviceId) {
    const { data: newDevice } = await supabase.from("license_devices").insert({
      license_id: license.id,
      device_id: deviceId,
      device_name: deviceName || null,
      platform: platform || null,
      app_version: appVersion || null,
      package_name: packageName || null,
      is_active: true,
    }).select("*").maybeSingle();

    if (newDevice) {
      device = newDevice;
      await supabase.from("licenses").update({
        activated_devices: 1,
        status: "active",
        activated_at: new Date().toISOString(),
      }).eq("id", license.id);
    }
  }

  const features = await getFeatures(plan.id);

  return json({
    success: true,
    licenseKey,
    plan: plan.code,
    expiresAt: expiresAt.toISOString(),
    maxDevices: plan.max_devices,
    features: buildFeaturesArray(features),
    message: "License created successfully",
  }, 201);
}

// GET /license-api/v1/project/config?projectApiKey=...
async function handleProjectConfig(url: URL): Promise<Response> {
  const projectApiKey = url.searchParams.get("projectApiKey");
  if (!projectApiKey) {
    return json({ success: false, message: "projectApiKey is required" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  // Return project configuration
  const settings = project.settings || {};
  return json({
    success: true,
    project: {
      name: project.name,
      isActive: project.is_active,
    },
    config: {
      forceUpdate: settings.force_update ?? false,
      forceUpdateVersion: settings.force_update_version ?? null,
      maintenanceMode: settings.maintenance_mode ?? false,
      maintenanceMessage: settings.maintenance_message ?? null,
      minimumAppVersion: settings.minimum_app_version ?? "1.0.0",
      supportUrl: settings.support_url ?? null,
      storeUrl: settings.store_url ?? null,
      refreshIntervalMinutes: settings.refresh_interval_minutes ?? 60,
      offlineValidityHours: settings.offline_validity_hours ?? 24,
    },
  });
}

// GET /license-api/v1/plans?projectApiKey=...
async function handlePlansList(url: URL): Promise<Response> {
  const projectApiKey = url.searchParams.get("projectApiKey");
  if (!projectApiKey) {
    return json({ success: false, message: "projectApiKey is required" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const { data: plans, error } = await supabase
    .from("license_plans")
    .select(`
      id,
      name,
      code,
      price,
      duration_days,
      max_devices,
      trial_days,
      is_active,
      features:license_features(feature_key, feature_type, feature_value)
    `)
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("price", { ascending: true });

  if (error) return json({ success: false, message: "Failed to fetch plans" }, 500);

  const formattedPlans = (plans || []).map((p: any) => ({
    code: p.code,
    name: p.name,
    price: p.price,
    durationDays: p.duration_days,
    maxDevices: p.max_devices,
    trialDays: p.trial_days,
    features: (p.features || []).map((f: any) => ({
      key: f.feature_key,
      type: f.feature_type,
      value: f.feature_value,
    })),
  }));

  return json({
    success: true,
    plans: formattedPlans,
  });
}

// GET /license-api/v1/packages?projectApiKey=...
async function handlePackagesList(url: URL): Promise<Response> {
  const projectApiKey = url.searchParams.get("projectApiKey");
  if (!projectApiKey) {
    return json({ success: false, message: "projectApiKey is required" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const { data: plans, error } = await supabase
    .from("license_plans")
    .select(`
      id,
      name,
      code,
      price,
      duration_days,
      max_devices,
      trial_days,
      label,
      description,
      is_active,
      sort_order,
      features:license_features(feature_key, feature_type, feature_value, is_menu)
    `)
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });

  if (error) return json({ success: false, message: "Failed to fetch packages" }, 500);

  const packages = (plans || []).map((p: any) => {
    const allFeatures = (p.features || []);
    const menuPermissions = allFeatures
      .filter((f: any) => f.is_menu === true && (f.feature_value === true || f.feature_value === "true"))
      .map((f: any) => f.feature_key);

    return {
      id: p.id,
      name: p.name,
      code: p.code,
      price: Number(p.price) || 0,
      durationDays: p.duration_days,
      maxDevices: p.max_devices,
      trialDays: p.trial_days || 0,
      label: p.label || null,
      description: p.description || null,
      menuPermissions,
      features: allFeatures.map((f: any) => ({
        key: f.feature_key,
        type: f.feature_type,
        value: f.feature_value,
        isMenu: f.is_menu || false,
      })),
    };
  });

  return json({
    success: true,
    project: {
      name: project.name,
      logo: project.settings?.logo || null,
      description: project.settings?.description || null,
    },
    packages,
  });
}

// GET /license-api/v1/payment/config?projectApiKey=...
async function handlePaymentConfig(url: URL): Promise<Response> {
  const projectApiKey = url.searchParams.get("projectApiKey");
  if (!projectApiKey) {
    return json({ success: false, message: "projectApiKey is required" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const settings = project.settings || {};
  const paymentSettings = settings.payment || {};

  return json({
    success: true,
    payment: {
      manualTransfer: {
        enabled: paymentSettings.manual_transfer_enabled ?? true,
        banks: paymentSettings.banks || [],
        qrisImage: paymentSettings.qris_image || null,
        instructions: paymentSettings.transfer_instructions || "Transfer ke rekening berikut, lalu konfirmasi pembayaran.",
        verificationTimeHours: paymentSettings.verification_time_hours || 24,
      },
      midtrans: {
        enabled: paymentSettings.midtrans_enabled ?? false,
        clientKey: paymentSettings.midtrans_client_key || null,
        isProduction: paymentSettings.midtrans_production ?? false,
      },
      tripay: {
        enabled: paymentSettings.tripay_enabled ?? false,
      },
      xendit: {
        enabled: paymentSettings.xendit_enabled ?? false,
      },
      duitku: {
        enabled: paymentSettings.duitku_enabled ?? false,
      },
    },
    currency: settings.currency || "IDR",
    taxRate: settings.tax_rate || 0,
  });
}

// POST /license-api/v1/connect (validate connection key and get project info)
async function handleConnect(body: RequestBody): Promise<Response> {
  const { projectApiKey } = body;

  if (!projectApiKey) {
    return json({ success: false, message: "projectApiKey is required" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Connection Key tidak valid" }, 403);

  const settings = project.settings || {};

  return json({
    success: true,
    connected: true,
    project: {
      id: project.id,
      name: project.name,
      logo: settings.logo || null,
      description: settings.description || null,
      currency: settings.currency || "IDR",
      timezone: settings.timezone || "Asia/Jakarta",
      supportUrl: settings.support_url || null,
      maintenanceMode: settings.maintenance_mode ?? false,
      maintenanceMessage: settings.maintenance_message || null,
    },
    serverTime: new Date().toISOString(),
    message: "Berhasil terhubung ke License Server",
  });
}

// POST /license-api/v1/subscription/create
async function handleSubscriptionCreate(body: RequestBody & { packageCode?: string; paymentMethod?: string }): Promise<Response> {
  const { projectApiKey, packageCode, paymentMethod, deviceId, customerName, customerEmail } = body;

  if (!projectApiKey || !packageCode || !deviceId) {
    return json({ success: false, message: "projectApiKey, packageCode, dan deviceId diperlukan" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  // Find plan
  const { data: plan, error: planError } = await supabase
    .from("license_plans")
    .select("*")
    .eq("project_id", project.id)
    .eq("code", packageCode)
    .eq("is_active", true)
    .maybeSingle();

  if (planError || !plan) return json({ success: false, message: "Paket tidak ditemukan" }, 404);

  // Check if device already has active license
  const { data: existingLicense } = await supabase
    .from("licenses")
    .select(`
      *,
      devices:license_devices!inner(device_id, is_active)
    `)
    .eq("project_id", project.id)
    .eq("devices.device_id", deviceId)
    .eq("devices.is_active", true)
    .in("status", ["active", "trial"])
    .maybeSingle();

  if (existingLicense) {
    return json({ success: false, message: "Perangkat sudah memiliki lisensi aktif" }, 409);
  }

  // Generate order number
  const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // Create subscription order
  const amount = Number(plan.price) || 0;
  const settings = project.settings || {};
  const taxRate = settings.tax_rate || 0;
  const taxAmount = Math.round(amount * taxRate);
  const totalAmount = amount + taxAmount;

  const subscriptionData = {
    project_id: project.id,
    plan_id: plan.id,
    order_number: orderNumber,
    device_id: deviceId,
    customer_name: customerName || null,
    customer_email: customerEmail || null,
    payment_method: paymentMethod || null,
    amount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    currency: settings.currency || "IDR",
    status: "waiting_payment",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
  };

  const { data: subscription, error: subError } = await supabase
    .from("license_subscriptions")
    .insert(subscriptionData)
    .select("*")
    .maybeSingle();

  if (subError || !subscription) {
    return json({ success: false, message: "Gagal membuat pesanan" }, 500);
  }

  return json({
    success: true,
    subscription: {
      id: subscription.id,
      orderNumber: subscription.order_number,
      packageName: plan.name,
      packageCode: plan.code,
      amount: subscription.amount,
      taxAmount: subscription.tax_amount,
      totalAmount: subscription.total_amount,
      currency: subscription.currency,
      status: subscription.status,
      paymentMethod: subscription.payment_method,
      createdAt: subscription.created_at,
      expiresAt: subscription.expires_at,
    },
    message: "Pesanan berhasil dibuat",
  }, 201);
}

// GET /license-api/v1/subscription/status?projectApiKey=...&orderNumber=...
async function handleSubscriptionStatus(url: URL): Promise<Response> {
  const projectApiKey = url.searchParams.get("projectApiKey");
  const orderNumber = url.searchParams.get("orderNumber");

  if (!projectApiKey || !orderNumber) {
    return json({ success: false, message: "projectApiKey dan orderNumber diperlukan" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const { data: subscription, error } = await supabase
    .from("license_subscriptions")
    .select(`
      *,
      plan:license_plans(name, code, duration_days, max_devices)
    `)
    .eq("project_id", project.id)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !subscription) {
    return json({ success: false, message: "Pesanan tidak ditemukan" }, 404);
  }

  return json({
    success: true,
    subscription: {
      id: subscription.id,
      orderNumber: subscription.order_number,
      packageName: subscription.plan?.name || "Unknown",
      packageCode: subscription.plan?.code || "unknown",
      amount: subscription.amount,
      taxAmount: subscription.tax_amount,
      totalAmount: subscription.total_amount,
      currency: subscription.currency,
      status: subscription.status,
      paymentMethod: subscription.payment_method,
      licenseKey: subscription.license_key || null,
      paidAt: subscription.paid_at || null,
      verifiedAt: subscription.verified_at || null,
      createdAt: subscription.created_at,
      expiresAt: subscription.expires_at,
    },
  });
}

// POST /license-api/v1/subscription/confirm-payment
async function handleConfirmPayment(body: RequestBody & { orderNumber?: string; paymentProof?: string }): Promise<Response> {
  const { projectApiKey, orderNumber, deviceId } = body;

  if (!projectApiKey || !orderNumber) {
    return json({ success: false, message: "projectApiKey dan orderNumber diperlukan" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const { data: subscription, error } = await supabase
    .from("license_subscriptions")
    .select(`
      *,
      plan:license_plans(*)
    `)
    .eq("project_id", project.id)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !subscription) {
    return json({ success: false, message: "Pesanan tidak ditemukan" }, 404);
  }

  if (subscription.status !== "waiting_payment") {
    return json({ success: false, message: `Status pesanan: ${subscription.status}` }, 400);
  }

  // Update status to waiting_verification
  await supabase
    .from("license_subscriptions")
    .update({
      status: "waiting_verification",
      payment_confirmed_at: new Date().toISOString(),
    })
    .eq("id", subscription.id);

  return json({
    success: true,
    status: "waiting_verification",
    message: "Pembayaran akan diverifikasi dalam 1x24 jam",
  });
}

// GET /license-api/v1/subscription/history?projectApiKey=...&deviceId=...
async function handleSubscriptionHistory(url: URL): Promise<Response> {
  const projectApiKey = url.searchParams.get("projectApiKey");
  const deviceId = url.searchParams.get("deviceId");

  if (!projectApiKey || !deviceId) {
    return json({ success: false, message: "projectApiKey dan deviceId diperlukan" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const { data: subscriptions, error } = await supabase
    .from("license_subscriptions")
    .select(`
      *,
      plan:license_plans(name, code, duration_days, max_devices)
    `)
    .eq("project_id", project.id)
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return json({ success: false, message: "Gagal mengambil riwayat" }, 500);
  }

  const formatted = (subscriptions || []).map((s: any) => ({
    id: s.id,
    orderNumber: s.order_number,
    packageName: s.plan?.name || "Unknown",
    packageCode: s.plan?.code || "unknown",
    amount: s.amount,
    taxAmount: s.tax_amount,
    totalAmount: s.total_amount,
    currency: s.currency,
    status: s.status,
    paymentMethod: s.payment_method,
    licenseKey: s.license_key || null,
    paidAt: s.paid_at || null,
    verifiedAt: s.verified_at || null,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
  }));

  return json({
    success: true,
    subscriptions: formatted,
  });
}

// POST /license-api/v1/payment/midtrans/token
async function handleMidtransToken(body: RequestBody & { orderNumber?: string }): Promise<Response> {
  const { projectApiKey, orderNumber } = body;

  if (!projectApiKey || !orderNumber) {
    return json({ success: false, message: "projectApiKey dan orderNumber diperlukan" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  // Get subscription
  const { data: subscription, error } = await supabase
    .from("license_subscriptions")
    .select(`
      *,
      plan:license_plans(name, code)
    `)
    .eq("project_id", project.id)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !subscription) {
    return json({ success: false, message: "Pesanan tidak ditemukan" }, 404);
  }

  // TODO: Actually call Midtrans API to get Snap Token
  // For now, return mock token
  const mockToken = `SB-Mock-${Date.now()}`;

  return json({
    success: true,
    token: mockToken,
    redirectUrl: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${mockToken}`,
    message: "Token pembayaran berhasil dibuat",
  });
}

// POST /license-api/v1/payment/midtrans/callback (webhook from Midtrans)
async function handleMidtransCallback(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { order_id, transaction_status, payment_type } = body;

    // Find subscription by order_number
    const { data: subscription } = await supabase
      .from("license_subscriptions")
      .select(`
        *,
        plan:license_plans(*),
        project:license_projects(*)
      `)
      .eq("order_number", order_id)
      .maybeSingle();

    if (!subscription) {
      return json({ success: false, message: "Order not found" }, 404);
    }

    if (transaction_status === "capture" || transaction_status === "settlement") {
      // Payment success - activate license
      const plan = subscription.plan;
      const project = subscription.project;

      // Generate license key
      const licenseKey = generateLicenseKey();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

      // Create license
      const { data: license } = await supabase.from("licenses").insert({
        project_id: project.id,
        plan_id: plan.id,
        license_key: licenseKey,
        status: "active",
        customer_name: subscription.customer_name,
        customer_email: subscription.customer_email,
        max_devices: plan.max_devices,
        activated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      }).select("*").maybeSingle();

      // Register device
      if (license) {
        await supabase.from("license_devices").insert({
          license_id: license.id,
          device_id: subscription.device_id,
          is_active: true,
          registered_at: now.toISOString(),
        });

        await supabase.from("licenses").update({
          activated_devices: 1,
        }).eq("id", license.id);
      }

      // Update subscription
      await supabase.from("license_subscriptions").update({
        status: "paid",
        paid_at: now.toISOString(),
        license_key: licenseKey,
        license_id: license?.id,
      }).eq("id", subscription.id);
    } else if (transaction_status === "deny" || transaction_status === "cancel") {
      await supabase.from("license_subscriptions").update({
        status: "cancelled",
      }).eq("id", subscription.id);
    } else if (transaction_status === "expire") {
      await supabase.from("license_subscriptions").update({
        status: "expired",
      }).eq("id", subscription.id);
    }

    return json({ success: true });
  } catch (e) {
    return json({ success: false, message: "Invalid callback" }, 400);
  }
}

// ============================================================
// CLIENT INTEGRATION HANDLERS
// ============================================================

// GET /license-api/v1/client/credentials
async function handleGetClientCredentials(url: URL): Promise<Response> {
  const projectApiKey = url.searchParams.get("projectApiKey");
  if (!projectApiKey) {
    return json({ success: false, message: "projectApiKey is required" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  // Get or create credentials
  let { data: credentials, error } = await supabase
    .from("project_client_credentials")
    .select("id, client_id, client_secret_hash, is_active, last_connected_at, connected_device_name, connected_platform, connected_app_version, connection_count, created_at, updated_at")
    .eq("project_id", project.id)
    .maybeSingle();

  if (!credentials) {
    // Create new credentials
    const clientId = "cli_" + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
    const clientSecret = "sec_" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');

    const { data: newCreds, error: insertError } = await supabase
      .from("project_client_credentials")
      .insert({
        project_id: project.id,
        client_id: clientId,
        client_secret_hash: clientSecret,
      })
      .select("id, client_id, client_secret_hash, is_active, last_connected_at, connected_device_name, connected_platform, connected_app_version, connection_count, created_at, updated_at")
      .maybeSingle();

    if (insertError || !newCreds) {
      return json({ success: false, message: "Failed to create credentials" }, 500);
    }
    credentials = newCreds;
  }

  return json({
    success: true,
    credentials: {
      id: credentials.id,
      clientId: credentials.client_id,
      clientSecret: credentials.client_secret_hash,
      isActive: credentials.is_active,
      lastConnectedAt: credentials.last_connected_at,
      connectedDeviceName: credentials.connected_device_name,
      connectedPlatform: credentials.connected_platform,
      connectedAppVersion: credentials.connected_app_version,
      connectionCount: credentials.connection_count,
      createdAt: credentials.created_at,
      updatedAt: credentials.updated_at,
    },
    serverUrl: `${Deno.env.get("SUPABASE_URL")?.replace("https://", "")}/functions/v1/license-api`,
  });
}

// POST /license-api/v1/client/credentials (regenerate)
async function handleRegenerateClientCredentials(body: { projectApiKey?: string; regenerateSecret?: boolean }): Promise<Response> {
  const { projectApiKey, regenerateSecret } = body;
  if (!projectApiKey) {
    return json({ success: false, message: "projectApiKey is required" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  // Generate new credentials
  const clientId = "cli_" + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
  const clientSecret = "sec_" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');

  const { data: credentials, error } = await supabase
    .from("project_client_credentials")
    .update({
      client_id: clientId,
      client_secret_hash: clientSecret,
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", project.id)
    .select("id, client_id, client_secret_hash")
    .maybeSingle();

  if (error || !credentials) {
    return json({ success: false, message: "Failed to regenerate credentials" }, 500);
  }

  // Invalidate all existing sessions
  await supabase
    .from("project_client_sessions")
    .update({ is_active: false })
    .eq("credential_id", credentials.id);

  return json({
    success: true,
    credentials: {
      clientId: credentials.client_id,
      clientSecret: credentials.client_secret_hash,
    },
    message: "Credentials regenerated successfully",
  });
}

// POST /license-api/v1/client/connect
async function handleClientConnect(body: {
  serverUrl?: string;
  clientId?: string;
  clientSecret?: string;
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  appVersion?: string;
}, req: Request): Promise<Response> {
  const startTime = Date.now();
  const { clientId, clientSecret, deviceId, deviceName, platform, appVersion } = body;

  if (!clientId || !clientSecret) {
    return json({ success: false, message: "Application ID and Application Secret are required" }, 400);
  }

  // Validate credentials
  const { data: credentials, error } = await supabase
    .from("project_client_credentials")
    .select("*, project:license_projects(*)")
    .eq("client_id", clientId)
    .eq("client_secret_hash", clientSecret)
    .maybeSingle();

  if (error || !credentials) {
    return json({ success: false, message: "Invalid Application ID or Application Secret" }, 401);
  }

  if (!credentials.is_active) {
    return json({ success: false, message: "Project Disabled" }, 403);
  }

  const project = credentials.project;

  if (!project || !project.is_active) {
    return json({ success: false, message: "Project Not Found" }, 404);
  }

  // Create session token
  const sessionToken = "sess_" + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');

  // Create session
  await supabase.from("project_client_sessions").insert({
    credential_id: credentials.id,
    session_token: sessionToken,
    device_id: deviceId || "web-" + Date.now(),
    device_name: deviceName || null,
    platform: platform || "web",
    app_version: appVersion || "1.0.0",
    ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null,
    user_agent: req.headers.get("user-agent") || null,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Update credentials with connection info
  await supabase
    .from("project_client_credentials")
    .update({
      last_connected_at: new Date().toISOString(),
      connected_device_id: deviceId || null,
      connected_device_name: deviceName || null,
      connected_platform: platform || "web",
      connected_app_version: appVersion || "1.0.0",
      connection_count: (credentials.connection_count || 0) + 1,
    })
    .eq("id", credentials.id);

  // Fetch packages with features
  const { data: plans } = await supabase
    .from("license_plans")
    .select(`
      id, name, code, price, duration_days, max_devices, trial_days,
      label, description, is_active, sort_order,
      features:license_features(feature_key, feature_type, feature_value, is_menu)
    `)
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const packages = (plans || []).map((p: any) => {
    const allFeatures = (p.features || []);
    const menuPermissions = allFeatures
      .filter((f: any) => f.is_menu === true && (f.feature_value === true || f.feature_value === "true"))
      .map((f: any) => f.feature_key);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      price: Number(p.price) || 0,
      durationDays: p.duration_days,
      maxDevices: p.max_devices,
      trialDays: p.trial_days || 0,
      label: p.label || null,
      description: p.description || null,
      menuPermissions,
      features: allFeatures.map((f: any) => ({
        key: f.feature_key,
        type: f.feature_type,
        value: f.feature_value,
        isMenu: f.is_menu || false,
      })),
    };
  });

  // Collect all menu permissions across all packages
  const allMenuPermissions = [...new Set(packages.flatMap((p: any) => p.menuPermissions))];

  const settings = project.settings || {};
  const responseTime = Date.now() - startTime;

  return json({
    success: true,
    connected: true,
    session: {
      token: sessionToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    project: {
      id: project.id,
      name: project.name,
      logo: settings.logo || null,
      description: settings.description || null,
      currency: settings.currency || "IDR",
      timezone: settings.timezone || "Asia/Jakarta",
      supportUrl: settings.support_url || null,
      maintenanceMode: settings.maintenance_mode || false,
      maintenanceMessage: settings.maintenance_message || null,
    },
    server: {
      version: settings.server_version || "1.0.0",
      platform: "supabase",
      apiStatus: "operational",
      responseTime: responseTime,
    },
    branding: {
      applicationName: settings.app_name || project.name,
      applicationLogo: settings.logo || null,
      primaryColor: settings.primary_color || "#3b82f6",
      secondaryColor: settings.secondary_color || "#64748b",
      accentColor: settings.accent_color || "#f59e0b",
      companyName: settings.company_name || project.name,
      website: settings.website || null,
      supportEmail: settings.support_email || null,
      supportWhatsapp: settings.support_whatsapp || null,
    },
    config: {
      forceUpdate: false,
      forceUpdateVersion: null,
      maintenanceMode: settings.maintenance_mode || false,
      maintenanceMessage: settings.maintenance_message || null,
      minimumAppVersion: settings.minimum_app_version || "1.0.0",
      refreshIntervalMinutes: settings.refresh_interval_minutes || 60,
      offlineValidityHours: settings.offline_validity_hours || 24,
      enableOffline: settings.enable_offline !== false,
      enableCloudBackup: settings.enable_cloud_backup || false,
      enableAI: settings.enable_ai || false,
    },
    packages,
    permissions: allMenuPermissions,
    payment: {
      manualTransfer: {
        enabled: settings.manual_transfer_enabled ?? true,
        banks: settings.bank_accounts || [],
        qrisImage: settings.qris_image || null,
        instructions: settings.payment_instructions || "Transfer ke rekening berikut, lalu konfirmasi pembayaran.",
        verificationTimeHours: settings.verification_time_hours || 24,
      },
      midtrans: {
        enabled: settings.midtrans_enabled ?? false,
        clientKey: settings.midtrans_client_key || null,
        isProduction: settings.midtrans_production ?? false,
      },
      tripay: { enabled: settings.tripay_enabled ?? false },
      xendit: { enabled: settings.xendit_enabled ?? false },
      duitku: { enabled: settings.duitku_enabled ?? false },
    },
    currency: settings.currency || "IDR",
    taxRate: settings.tax_rate || 0,
    licenseConfig: {
      forceUpdate: false,
      forceUpdateVersion: null,
      maintenanceMode: settings.maintenance_mode || false,
      maintenanceMessage: settings.maintenance_message || null,
      minimumAppVersion: settings.minimum_app_version || "1.0.0",
      refreshIntervalMinutes: settings.refresh_interval_minutes || 60,
      offlineValidityHours: settings.offline_validity_hours || 24,
    },
    generalSettings: {
      businessName: settings.app_name || project.name,
      businessTagline: settings.description || null,
      logo: settings.logo || null,
      currency: settings.currency || "IDR",
      timezone: settings.timezone || "Asia/Jakarta",
      language: settings.language || "id",
      address: settings.address || null,
      phone: settings.phone || null,
      email: settings.email || null,
    },
    serverTime: new Date().toISOString(),
    responseTime,
    message: "Connected Successfully",
  });
}

// GET /license-api/v1/client/sync
async function handleClientSync(url: URL): Promise<Response> {
  const sessionToken = url.searchParams.get("sessionToken");
  if (!sessionToken) {
    return json({ success: false, message: "sessionToken is required" }, 400);
  }

  // Validate session
  const { data: session, error: sessionError } = await supabase
    .from("project_client_sessions")
    .select(`
      *,
      credential:project_client_credentials(
        *,
        project:license_projects(*)
      )
    `)
    .eq("session_token", sessionToken)
    .eq("is_active", true)
    .maybeSingle();

  if (sessionError || !session) {
    return json({ success: false, message: "Invalid or expired session" }, 401);
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase.from("project_client_sessions").update({ is_active: false }).eq("id", session.id);
    return json({ success: false, message: "Session expired" }, 401);
  }

  const project = session.credential.project;
  const settings = project.settings || {};

  // Fetch packages with features
  const { data: plans } = await supabase
    .from("license_plans")
    .select(`
      id, name, code, price, duration_days, max_devices, trial_days,
      label, description, is_active, sort_order,
      features:license_features(feature_key, feature_type, feature_value, is_menu)
    `)
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const packages = (plans || []).map((p: any) => {
    const allFeatures = (p.features || []);
    const menuPermissions = allFeatures
      .filter((f: any) => f.is_menu === true && (f.feature_value === true || f.feature_value === "true"))
      .map((f: any) => f.feature_key);
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      price: Number(p.price) || 0,
      durationDays: p.duration_days,
      maxDevices: p.max_devices,
      trialDays: p.trial_days || 0,
      label: p.label || null,
      description: p.description || null,
      menuPermissions,
      features: allFeatures.map((f: any) => ({
        key: f.feature_key,
        type: f.feature_type,
        value: f.feature_value,
        isMenu: f.is_menu || false,
      })),
    };
  });

  const allMenuPermissions = [...new Set(packages.flatMap((p: any) => p.menuPermissions))];

  // Update last sync
  await supabase
    .from("project_client_sessions")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", session.id);

  return json({
    success: true,
    project: {
      id: project.id,
      name: project.name,
      logo: settings.logo || null,
      description: settings.description || null,
      currency: settings.currency || "IDR",
      timezone: settings.timezone || "Asia/Jakarta",
      supportUrl: settings.support_url || null,
      maintenanceMode: settings.maintenance_mode || false,
      maintenanceMessage: settings.maintenance_message || null,
    },
    server: {
      version: settings.server_version || "1.0.0",
      platform: "supabase",
      apiStatus: "operational",
    },
    branding: {
      applicationName: settings.app_name || project.name,
      applicationLogo: settings.logo || null,
      primaryColor: settings.primary_color || "#3b82f6",
      secondaryColor: settings.secondary_color || "#64748b",
      accentColor: settings.accent_color || "#f59e0b",
      companyName: settings.company_name || project.name,
      website: settings.website || null,
      supportEmail: settings.support_email || null,
      supportWhatsapp: settings.support_whatsapp || null,
    },
    config: {
      forceUpdate: false,
      forceUpdateVersion: null,
      maintenanceMode: settings.maintenance_mode || false,
      maintenanceMessage: settings.maintenance_message || null,
      minimumAppVersion: settings.minimum_app_version || "1.0.0",
      refreshIntervalMinutes: settings.refresh_interval_minutes || 60,
      offlineValidityHours: settings.offline_validity_hours || 24,
      enableOffline: settings.enable_offline !== false,
      enableCloudBackup: settings.enable_cloud_backup || false,
      enableAI: settings.enable_ai || false,
    },
    packages,
    permissions: allMenuPermissions,
    payment: {
      manualTransfer: {
        enabled: settings.manual_transfer_enabled ?? true,
        banks: settings.bank_accounts || [],
        qrisImage: settings.qris_image || null,
        instructions: settings.payment_instructions || "Transfer ke rekening berikut, lalu konfirmasi pembayaran.",
        verificationTimeHours: settings.verification_time_hours || 24,
      },
      midtrans: {
        enabled: settings.midtrans_enabled ?? false,
        clientKey: settings.midtrans_client_key || null,
        isProduction: settings.midtrans_production ?? false,
      },
      tripay: { enabled: settings.tripay_enabled ?? false },
      xendit: { enabled: settings.xendit_enabled ?? false },
      duitku: { enabled: settings.duitku_enabled ?? false },
    },
    currency: settings.currency || "IDR",
    taxRate: settings.tax_rate || 0,
    licenseConfig: {
      forceUpdate: false,
      forceUpdateVersion: null,
      maintenanceMode: settings.maintenance_mode || false,
      maintenanceMessage: settings.maintenance_message || null,
      minimumAppVersion: settings.minimum_app_version || "1.0.0",
      refreshIntervalMinutes: settings.refresh_interval_minutes || 60,
      offlineValidityHours: settings.offline_validity_hours || 24,
    },
    generalSettings: {
      businessName: settings.app_name || project.name,
      businessTagline: settings.description || null,
      logo: settings.logo || null,
      currency: settings.currency || "IDR",
      timezone: settings.timezone || "Asia/Jakarta",
      language: settings.language || "id",
      address: settings.address || null,
      phone: settings.phone || null,
      email: settings.email || null,
    },
    syncedAt: new Date().toISOString(),
  });
}

// POST /license-api/v1/client/disconnect
async function handleClientDisconnect(body: { sessionToken?: string }): Promise<Response> {
  const { sessionToken } = body;
  if (!sessionToken) {
    return json({ success: false, message: "sessionToken is required" }, 400);
  }

  await supabase
    .from("project_client_sessions")
    .update({ is_active: false })
    .eq("session_token", sessionToken);

  return json({ success: true, message: "Disconnected successfully" });
}

// GET /license-api/v1/client/status
async function handleClientStatus(url: URL): Promise<Response> {
  const projectApiKey = url.searchParams.get("projectApiKey");
  if (!projectApiKey) {
    return json({ success: false, message: "projectApiKey is required" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  const { data: credentials } = await supabase
    .from("project_client_credentials")
    .select("*")
    .eq("project_id", project.id)
    .maybeSingle();

  if (!credentials) {
    return json({ success: false, message: "No client credentials found" }, 404);
  }

  const { data: sessions } = await supabase
    .from("project_client_sessions")
    .select("*")
    .eq("credential_id", credentials.id)
    .eq("is_active", true)
    .order("last_sync_at", { ascending: false })
    .limit(5);

  return json({
    success: true,
    status: {
      isActive: credentials.is_active,
      lastConnectedAt: credentials.last_connected_at,
      connectedDeviceName: credentials.connected_device_name,
      connectedPlatform: credentials.connected_platform,
      connectedAppVersion: credentials.connected_app_version,
      connectionCount: credentials.connection_count,
    },
    activeSessions: (sessions || []).map((s) => ({
      deviceId: s.device_id,
      deviceName: s.device_name,
      platform: s.platform,
      appVersion: s.app_version,
      lastSyncAt: s.last_sync_at,
      expiresAt: s.expires_at,
    })),
  });
}

// POST /license-api/v1/license/trial (create trial license)
async function handleCreateTrial(body: RequestBody): Promise<Response> {
  const { projectApiKey, deviceId, deviceName, platform, appVersion, packageName, customerName, customerEmail } = body;

  if (!projectApiKey || !deviceId) {
    return json({ success: false, message: "projectApiKey and deviceId are required" }, 400);
  }

  const project = await validateProject(projectApiKey);
  if (!project) return json({ success: false, message: "Invalid project API key" }, 403);

  // Find starter plan (has trial_days)
  const { data: plan } = await supabase
    .from("license_plans")
    .select("*")
    .eq("project_id", project.id)
    .eq("code", "starter")
    .eq("is_active", true)
    .maybeSingle();

  if (!plan) return json({ success: false, message: "Trial plan not found" }, 404);

  // Check if device already has a trial
  const { data: existingTrial } = await supabase
    .from("licenses")
    .select(`
      *,
      devices:license_devices!inner(device_id)
    `)
    .eq("project_id", project.id)
    .eq("plan_id", plan.id)
    .eq("devices.device_id", deviceId)
    .maybeSingle();

  if (existingTrial) {
    return json({ success: false, message: "Device already has a trial license" }, 409);
  }

  const licenseKey = generateLicenseKey();
  const now = new Date();
  const trialDays = plan.trial_days || 30;
  const expiresAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  const { data: license, error } = await supabase.from("licenses").insert({
    project_id: project.id,
    plan_id: plan.id,
    license_key: licenseKey,
    status: "active",
    customer_name: customerName || "Trial User",
    customer_email: customerEmail || null,
    max_devices: plan.max_devices,
    activated_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  }).select("*").maybeSingle();

  if (error || !license) return json({ success: false, message: "Failed to create trial license" }, 500);

  // Register device
  const { data: device } = await supabase.from("license_devices").insert({
    license_id: license.id,
    device_id: deviceId,
    device_name: deviceName || null,
    platform: platform || null,
    app_version: appVersion || null,
    package_name: packageName || null,
    is_active: true,
  }).select("*").maybeSingle();

  await supabase.from("licenses").update({ activated_devices: 1 }).eq("id", license.id);

  const features = await getFeatures(plan.id);

  return json({
    success: true,
    status: "active",
    plan: plan.code,
    planName: plan.name,
    licenseKey,
    expiresAt: expiresAt.toISOString(),
    daysRemaining: trialDays,
    maxDevices: plan.max_devices,
    activatedDevices: 1,
    device: buildDeviceObject(device),
    features: buildFeaturesArray(features),
    message: "Trial license created",
  }, 201);
}

// ============================================================
// MAIN ROUTER
// ============================================================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace("/license-api", "").replace(/^\/+/, "");
    const segments = path.split("/").filter(Boolean);

    // Route: /v1/license/{endpoint} and /v1/device/{endpoint}
    if (segments[0] !== "v1") {
      return json({ success: false, message: "Invalid API version. Use /v1/" }, 400);
    }

    const resource = segments[1]; // "license" or "device"
    const action = segments[2]; // endpoint name

    if (resource === "project") {
      if (action === "config" && req.method === "GET") {
        return await handleProjectConfig(url);
      }
    }

    if (resource === "plans") {
      if (req.method === "GET") {
        return await handlePlansList(url);
      }
    }

    if (resource === "packages") {
      if (req.method === "GET") {
        return await handlePackagesList(url);
      }
    }

    if (resource === "connect") {
      if (req.method === "POST") {
        const body = await req.json();
        return await handleConnect(body);
      }
    }

    if (resource === "subscription") {
      if (action === "create" && req.method === "POST") {
        const body = await req.json();
        return await handleSubscriptionCreate(body);
      }
      if (action === "status" && req.method === "GET") {
        return await handleSubscriptionStatus(url);
      }
      if (action === "confirm-payment" && req.method === "POST") {
        const body = await req.json();
        return await handleConfirmPayment(body);
      }
      if (action === "history" && req.method === "GET") {
        return await handleSubscriptionHistory(url);
      }
    }

    if (resource === "payment") {
      if (action === "config" && req.method === "GET") {
        return await handlePaymentConfig(url);
      }
      if (action === "midtrans" && segments[3] === "token" && req.method === "POST") {
        const body = await req.json();
        return await handleMidtransToken(body);
      }
      if (action === "midtrans" && segments[3] === "callback" && req.method === "POST") {
        return await handleMidtransCallback(req);
      }
    }

    if (resource === "license") {
      if (action === "status" && req.method === "GET") {
        return await handleStatus(req, url);
      }
      if (action === "activate" && req.method === "POST") {
        const body = await req.json();
        return await handleActivate(body);
      }
      if (action === "check" && req.method === "POST") {
        const body = await req.json();
        return await handleCheck(body);
      }
      if (action === "refresh" && req.method === "POST") {
        const body = await req.json();
        return await handleRefresh(body);
      }
      if (action === "deactivate" && req.method === "POST") {
        const body = await req.json();
        return await handleDeactivate(body);
      }
      if (action === "create" && req.method === "POST") {
        const body = await req.json();
        return await handleCreateLicense(body);
      }
      if (action === "trial" && req.method === "POST") {
        const body = await req.json();
        return await handleCreateTrial(body);
      }
    }

    if (resource === "device") {
      if (action === "register" && req.method === "POST") {
        const body = await req.json();
        return await handleDeviceRegister(body);
      }
      if (action === "reset" && req.method === "POST") {
        const body = await req.json();
        return await handleDeviceReset(body);
      }
    }

    // Client integration endpoints
    if (resource === "client") {
      if (action === "credentials" && req.method === "GET") {
        return await handleGetClientCredentials(url);
      }
      if (action === "credentials" && req.method === "POST") {
        const body = await req.json();
        return await handleRegenerateClientCredentials(body);
      }
      if (action === "connect" && req.method === "POST") {
        const body = await req.json();
        return await handleClientConnect(body, req);
      }
      if (action === "sync" && req.method === "GET") {
        return await handleClientSync(url);
      }
      if (action === "disconnect" && req.method === "POST") {
        const body = await req.json();
        return await handleClientDisconnect(body);
      }
      if (action === "status" && req.method === "GET") {
        return await handleClientStatus(url);
      }
    }

    return json({ success: false, message: `Unknown endpoint: ${resource}/${action || "undefined"}` }, 404);
  } catch (err) {
    return json({ success: false, message: err.message }, 500);
  }
});
