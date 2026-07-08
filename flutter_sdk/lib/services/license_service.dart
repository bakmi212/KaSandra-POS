/// License service for all license API operations.
import '../core/api_client.dart';
import '../core/cache_manager.dart';
import '../models/license_model.dart';
import '../models/plan_model.dart';
import '../services/device_service.dart';

class LicenseService {
  final ApiClient _api;
  final CacheManager _cache;
  final DeviceService _device;
  String _projectApiKey;
  String _appVersion;
  String _packageName;

  LicenseService({
    required ApiClient api,
    required CacheManager cache,
    required DeviceService device,
    required String projectApiKey,
    required String appVersion,
    required String packageName,
  })  : _api = api,
        _cache = cache,
        _device = device,
        _projectApiKey = projectApiKey,
        _appVersion = appVersion,
        _packageName = packageName;

  void updateConfig({
    required String projectApiKey,
    required String appVersion,
    required String packageName,
  }) {
    _projectApiKey = projectApiKey;
    _appVersion = appVersion;
    _packageName = packageName;
  }

  /// Validate an existing stored license key.
  Future<LicenseModel?> checkLicense(String licenseKey) async {
    try {
      final result = await _api.post('license/check', {
        'projectApiKey': _projectApiKey,
        'licenseKey': licenseKey,
        'deviceId': await _cache.getDeviceId(),
        'appVersion': _appVersion,
      });

      if (result['success'] == true) {
        final license = LicenseModel.fromJson(result);
        await _cache.saveLicense(license);
        return license;
      }

      // Return status-only model if server signals expiry/revoke
      if (result['status'] != null) {
        return LicenseModel.fromJson({...result, 'licenseKey': licenseKey});
      }

      return null;
    } catch (_) {
      // Offline — return cached
      return _cache.loadLicense();
    }
  }

  /// Activate a license key on this device.
  Future<LicenseModel?> activate(String licenseKey) async {
    final result = await _api.post('license/activate', {
      'projectApiKey': _projectApiKey,
      'licenseKey': licenseKey.toUpperCase(),
      'deviceId': await _cache.getDeviceId(),
      'deviceName': await _device.getDeviceName(),
      'platform': _device.getPlatform(),
      'appVersion': _appVersion,
      'packageName': _packageName,
    });

    if (result['success'] == true) {
      final license = LicenseModel.fromJson(result);
      await _cache.saveLicense(license);
      return license;
    }

    return null;
  }

  /// Start a free trial license for this device.
  Future<LicenseModel?> startTrial({
    String? customerName,
    String? customerEmail,
  }) async {
    final result = await _api.post('license/trial', {
      'projectApiKey': _projectApiKey,
      'deviceId': await _cache.getDeviceId(),
      'deviceName': await _device.getDeviceName(),
      'platform': _device.getPlatform(),
      'appVersion': _appVersion,
      'packageName': _packageName,
      'customerName': customerName,
      'customerEmail': customerEmail,
    });

    if (result['success'] == true) {
      final license = LicenseModel.fromJson(result);
      await _cache.saveLicense(license);
      return license;
    }

    return null;
  }

  /// Deactivate the license on this device.
  Future<void> deactivate(String licenseKey) async {
    await _api.post('license/deactivate', {
      'projectApiKey': _projectApiKey,
      'licenseKey': licenseKey,
      'deviceId': await _cache.getDeviceId(),
    });
    await _cache.clearLicense();
  }

  /// Get status for a specific license key without activating.
  Future<LicenseModel?> getStatus(String licenseKey) async {
    try {
      final result = await _api.get('license/status', {
        'projectApiKey': _projectApiKey,
        'licenseKey': licenseKey,
        'deviceId': await _cache.getDeviceId(),
      });

      if (result['success'] == true) {
        return LicenseModel.fromJson(result);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /// Fetch available plans from server.
  Future<List<PlanModel>> fetchPlans() async {
    try {
      final result = await _api.get('plans', {
        'projectApiKey': _projectApiKey,
      });

      if (result['success'] == true) {
        final plansList = result['plans'] as List<dynamic>? ?? [];
        final plans = plansList
            .map((p) => PlanModel.fromJson(p as Map<String, dynamic>))
            .toList();
        await _cache.savePlans(plans);
        return plans;
      }
    } catch (_) {
      // Offline — return cached
      return await _cache.loadPlans() ?? [];
    }
    return await _cache.loadPlans() ?? [];
  }

  /// Fetch project remote configuration from server.
  Future<Map<String, dynamic>?> fetchRemoteConfig() async {
    try {
      final result = await _api.get('project/config', {
        'projectApiKey': _projectApiKey,
      });

      if (result['success'] == true) {
        await _cache.saveRemoteConfig(result);
        return result;
      }
    } catch (_) {
      return await _cache.loadRemoteConfig();
    }
    return await _cache.loadRemoteConfig();
  }
}
