/// Cache manager for offline storage.
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/license_model.dart';
import '../models/plan_model.dart';

class CacheManager {
  static const _keyLicense = 'ksandra_license_cache';
  static const _keyLicenseKey = 'ksandra_license_key';
  static const _keyPlans = 'ksandra_plans_cache';
  static const _keyRemoteConfig = 'ksandra_remote_config';
  static const _keyDeviceId = 'ksandra_device_id';
  static const _keyLastCheck = 'ksandra_last_check';

  SharedPreferences? _prefs;

  Future<SharedPreferences> get _instance async {
    _prefs ??= await SharedPreferences.getInstance();
    return _prefs!;
  }

  // License
  Future<void> saveLicense(LicenseModel license) async {
    final prefs = await _instance;
    await prefs.setString(_keyLicense, jsonEncode(license.toJson()));
    await prefs.setString(_keyLicenseKey, license.licenseKey);
    await prefs.setString(_keyLastCheck, DateTime.now().toIso8601String());
  }

  Future<LicenseModel?> loadLicense() async {
    final prefs = await _instance;
    final raw = prefs.getString(_keyLicense);
    if (raw == null) return null;
    try {
      return LicenseModel.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> clearLicense() async {
    final prefs = await _instance;
    await prefs.remove(_keyLicense);
    await prefs.remove(_keyLicenseKey);
  }

  // License key
  Future<String?> getLicenseKey() async {
    final prefs = await _instance;
    return prefs.getString(_keyLicenseKey);
  }

  // Plans
  Future<void> savePlans(List<PlanModel> plans) async {
    final prefs = await _instance;
    await prefs.setString(
      _keyPlans,
      jsonEncode(plans.map((p) => p.toJson()).toList()),
    );
  }

  Future<List<PlanModel>?> loadPlans() async {
    final prefs = await _instance;
    final raw = prefs.getString(_keyPlans);
    if (raw == null) return null;
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((p) => PlanModel.fromJson(p as Map<String, dynamic>)).toList();
    } catch (_) {
      return null;
    }
  }

  // Remote config
  Future<void> saveRemoteConfig(Map<String, dynamic> config) async {
    final prefs = await _instance;
    await prefs.setString(_keyRemoteConfig, jsonEncode(config));
  }

  Future<Map<String, dynamic>?> loadRemoteConfig() async {
    final prefs = await _instance;
    final raw = prefs.getString(_keyRemoteConfig);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  // Device ID
  Future<String> getDeviceId() async {
    final prefs = await _instance;
    var id = prefs.getString(_keyDeviceId);
    if (id == null || id.isEmpty) {
      id = 'flutter-${DateTime.now().millisecondsSinceEpoch}-${_random(8)}';
      await prefs.setString(_keyDeviceId, id);
    }
    return id;
  }

  // Last check time
  Future<DateTime?> getLastCheckTime() async {
    final prefs = await _instance;
    final raw = prefs.getString(_keyLastCheck);
    if (raw == null) return null;
    return DateTime.tryParse(raw);
  }

  String _random(int length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final b = StringBuffer();
    for (var i = 0; i < length; i++) {
      b.write(chars[DateTime.now().microsecond % chars.length]);
    }
    return b.toString();
  }
}
