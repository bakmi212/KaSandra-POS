/// Auth service for session and credential management.
import '../core/cache_manager.dart';

class AuthService {
  final CacheManager _cache;

  AuthService(this._cache);

  Future<String?> getLicenseKey() => _cache.getLicenseKey();

  Future<String> getDeviceId() => _cache.getDeviceId();

  Future<void> saveLicenseKey(String key) async {
    // Stored as part of license save, no separate action needed.
    // This method exists for explicit clarity when clearing/restoring keys.
  }

  Future<void> clearCredentials() => _cache.clearLicense();
}
