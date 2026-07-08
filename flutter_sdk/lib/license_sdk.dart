/// KaSandra License SDK — Production-ready plug-and-play Flutter package.
///
/// Usage:
/// ```dart
/// import 'package:ksandra_license/license_sdk.dart';
///
/// final sdk = LicenseSDK();
/// await sdk.initialize(
///   serverUrl: 'https://your-project.supabase.co/functions/v1/license-api',
///   projectApiKey: 'your_project_key',
/// );
///
/// if (sdk.isLicensed) {
///   print('Plan: ${sdk.planName}');
///   if (sdk.hasFeature('multi_payment')) {
///     // enable feature
///   }
/// }
/// ```
library ksandra_license;

import 'dart:async';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/widgets.dart' show WidgetsBindingObserver, AppLifecycleState;
import 'core/api_client.dart';
import 'core/cache_manager.dart';
import 'core/config.dart';
import 'models/feature_model.dart';
import 'models/license_model.dart';
import 'models/plan_model.dart';
import 'services/auth_service.dart';
import 'services/device_service.dart';
import 'services/feature_service.dart';
import 'services/license_service.dart';

export 'models/feature_model.dart';
export 'models/license_model.dart';
export 'models/plan_model.dart';
export 'models/package_model.dart';
export 'models/payment_config_model.dart';
export 'models/project_info_model.dart';
export 'models/subscription_model.dart';
export 'models/models.dart';
export 'core/config.dart';
export 'core/api_client.dart';

/// Main SDK class for license management.
class LicenseSDK with WidgetsBindingObserver {
  // Internal services
  late final ApiClient _api;
  late final CacheManager _cache;
  late final DeviceService _device;
  late final AuthService _auth;
  late final LicenseService _licenseService;
  late final FeatureService _featureService;

  // State
  SdkConfig? _config;
  LicenseModel? _license;
  List<PlanModel> _plans = [];
  Map<String, dynamic>? _remoteConfig;
  bool _initialized = false;

  // Auto-refresh
  Timer? _refreshTimer;
  DateTime? _lastRefresh;

  // ============================================================
  // EVENTS
  // ============================================================

  void Function(LicenseModel?)? onLicenseChanged;
  void Function(LicenseModel)? onActivated;
  void Function()? onExpired;
  void Function(String oldPlan, String newPlan)? onPlanChanged;
  void Function(String? message)? onMaintenance;
  void Function(String? minVersion)? onForceUpdate;
  void Function(String message)? onDeviceLimitReached;

  // ============================================================
  // PUBLIC PROPERTIES
  // ============================================================

  bool get isInitialized => _initialized;
  LicenseModel? get license => _license;
  List<PlanModel> get plans => List.unmodifiable(_plans);
  Map<String, dynamic>? get remoteConfig => _remoteConfig;

  String get status => _license?.status ?? 'inactive';
  bool get isLicensed => _license?.isActive ?? false;
  bool get isActive => _license?.isActive ?? false;
  bool get isExpired => _license?.isExpired ?? false;
  bool get isTrial => _license?.isTrial ?? false;
  String get plan => _license?.plan ?? '';
  String get planName => _license?.planName ?? '';
  int get daysRemaining => _license?.daysRemaining ?? 0;
  String get licenseKey => _license?.licenseKey ?? '';
  String? get expiresAt => _license?.expiresAt;
  int get maxDevices => _license?.maxDevices ?? 1;
  int get activatedDevices => _license?.activatedDevices ?? 0;
  DateTime? get lastRefresh => _lastRefresh;
  List<FeatureModel> get features => _license?.features ?? [];

  // Remote config shortcuts
  bool get isMaintenanceMode => _remoteConfig?['config']?['maintenanceMode'] ?? false;
  bool get requiresForceUpdate => _remoteConfig?['config']?['forceUpdate'] ?? false;

  // ============================================================
  // INITIALIZATION
  // ============================================================

  Future<void> initialize({
    required String serverUrl,
    required String projectApiKey,
    String packageName = 'com.example.app',
    String appVersion = '1.0.0',
    Duration refreshInterval = const Duration(minutes: 60),
    bool autoRefresh = true,
    bool autoTrial = false,
  }) async {
    _config = SdkConfig(
      serverUrl: serverUrl,
      projectApiKey: projectApiKey,
      packageName: packageName,
      appVersion: appVersion,
      refreshInterval: refreshInterval,
      autoRefresh: autoRefresh,
      autoTrial: autoTrial,
    );

    // Initialize services
    _cache = CacheManager();
    _api = ApiClient(serverUrl: serverUrl, projectApiKey: projectApiKey);
    _device = DeviceService();
    _auth = AuthService(_cache);
    _licenseService = LicenseService(
      api: _api,
      cache: _cache,
      device: _device,
      projectApiKey: projectApiKey,
      appVersion: appVersion,
      packageName: packageName,
    );
    _featureService = FeatureService();

    // Load cached data
    _license = await _cache.loadLicense();
    _plans = await _cache.loadPlans() ?? [];
    _remoteConfig = await _cache.loadRemoteConfig();
    _featureService.update(_license, _plans);

    _initialized = true;

    // Fetch everything from server
    await _fetchAllFromServer();

    // Start auto-refresh timer
    if (autoRefresh) {
      _startRefreshTimer(refreshInterval);
    }

    // Fire events if applicable
    if (isMaintenanceMode) {
      onMaintenance?.call(_remoteConfig?['config']?['maintenanceMessage']);
    }
    if (requiresForceUpdate) {
      onForceUpdate?.call(_remoteConfig?['config']?['forceUpdateVersion']);
    }
  }

  Future<void> _fetchAllFromServer() async {
    try {
      await _fetchRemoteConfig();
      await _fetchPlans();
      await _refreshLicense();
      _lastRefresh = DateTime.now();
    } catch (_) {
      // Network error — continue with cached data
    }
  }

  Future<void> _fetchRemoteConfig() async {
    final config = await _licenseService.fetchRemoteConfig();
    if (config != null) {
      _remoteConfig = config;
    }
  }

  Future<void> _fetchPlans() async {
    _plans = await _licenseService.fetchPlans();
    _featureService.update(_license, _plans);
  }

  Future<void> _refreshLicense() async {
    final storedKey = await _auth.getLicenseKey();
    if (storedKey == null || storedKey.isEmpty) {
      final shouldAutoTrial = _remoteConfig?['config']?['autoTrial'] ?? false;
      if (shouldAutoTrial) {
        await startTrial();
      }
      return;
    }

    final oldPlan = _license?.plan ?? '';
    final newLicense = await _licenseService.checkLicense(storedKey);

    if (newLicense != null) {
      final oldLicense = _license;
      _license = newLicense;
      _featureService.update(_license, _plans);

      onLicenseChanged?.call(_license);

      if (oldPlan.isNotEmpty && oldPlan != _license!.plan) {
        onPlanChanged?.call(oldPlan, _license!.plan);
      }

      if (_license!.isExpired && (oldLicense?.isActive ?? false)) {
        onExpired?.call();
      }
    }
  }

  void _startRefreshTimer(Duration interval) {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(interval, (_) => refresh());
  }

  // ============================================================
  // PUBLIC METHODS
  // ============================================================

  /// Manually refresh license status.
  Future<bool> refresh() async {
    if (!_initialized) return false;
    try {
      await _refreshLicense();
      _lastRefresh = DateTime.now();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Activate a license key.
  Future<bool> activate(String licenseKey) async {
    if (!_initialized) return false;

    final oldPlan = _license?.plan ?? '';
    final newLicense = await _licenseService.activate(licenseKey);

    if (newLicense != null) {
      final wasInactive = _license == null || !_license!.isActive;
      _license = newLicense;
      _featureService.update(_license, _plans);

      onLicenseChanged?.call(_license);

      if (wasInactive || _license!.isActive) {
        onActivated?.call(_license!);
      }

      if (oldPlan.isNotEmpty && oldPlan != _license!.plan) {
        onPlanChanged?.call(oldPlan, _license!.plan);
      }

      return true;
    }

    return false;
  }

  /// Start a free trial license.
  Future<bool> startTrial({String? customerName, String? customerEmail}) async {
    if (!_initialized) return false;

    final newLicense = await _licenseService.startTrial(
      customerName: customerName,
      customerEmail: customerEmail,
    );

    if (newLicense != null) {
      _license = newLicense;
      _featureService.update(_license, _plans);

      onLicenseChanged?.call(_license);
      onActivated?.call(_license!);

      return true;
    }

    return false;
  }

  /// Deactivate this device.
  Future<void> deactivate() async {
    if (!_initialized) return;

    final storedKey = await _auth.getLicenseKey();
    if (storedKey == null) return;

    await _licenseService.deactivate(storedKey);
    _license = null;
    _featureService.update(null, _plans);

    onLicenseChanged?.call(null);
  }

  /// Get status for a license key without activating.
  Future<LicenseModel?> getStatus(String licenseKey) async {
    if (!_initialized) return null;
    return _licenseService.getStatus(licenseKey);
  }

  /// Update refresh interval.
  void setRefreshInterval(Duration interval) {
    if (_config?.autoRefresh ?? false) {
      _startRefreshTimer(interval);
    }
  }

  // ============================================================
  // FEATURE API
  // ============================================================

  bool hasFeature(String key) => _featureService.hasFeature(key);
  dynamic getFeature(String key) => _featureService.getFeature(key);
  int getLimit(String key) => _featureService.getLimit(key);
  bool getBoolean(String key) => _featureService.getBoolean(key);
  String getString(String key) => _featureService.getString(key);
  Map<String, dynamic> getAllFeatures() => _featureService.getAllFeatures();
  bool planHasFeature(String planCode, String key) => _featureService.planHasFeature(planCode, key);
  int planGetLimit(String planCode, String key) => _featureService.planGetLimit(planCode, key);

  // ============================================================
  // LIFECYCLE
  // ============================================================

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      refresh();
    }
  }

  void dispose() {
    _refreshTimer?.cancel();
    if (!kIsWeb) {
      try {
        // WidgetsBinding.instance.removeObserver(this);
      } catch (_) {}
    }
  }
}
