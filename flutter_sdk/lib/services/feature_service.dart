/// Feature service for feature flag evaluation.
import '../models/feature_model.dart';
import '../models/license_model.dart';
import '../models/plan_model.dart';

class FeatureService {
  LicenseModel? _license;
  List<PlanModel> _plans = [];

  void update(LicenseModel? license, List<PlanModel> plans) {
    _license = license;
    _plans = plans;
  }

  /// Check if a boolean feature is enabled for the current license.
  bool hasFeature(String key) {
    final feature = _findFeature(key);
    if (feature == null) return false;
    return feature.boolValue;
  }

  /// Get a feature's raw value.
  dynamic getFeature(String key) => _findFeature(key)?.value;

  /// Get a feature's integer value (limits, quotas).
  int getLimit(String key) {
    final feature = _findFeature(key);
    return feature?.intValue ?? 0;
  }

  /// Get a feature's boolean value.
  bool getBoolean(String key) => hasFeature(key);

  /// Get a feature's string value.
  String getString(String key) => _findFeature(key)?.stringValue ?? '';

  /// Get all features as a map.
  Map<String, dynamic> getAllFeatures() {
    final result = <String, dynamic>{};
    for (final f in _license?.features ?? <FeatureModel>[]) {
      result[f.key] = f.value;
    }
    return result;
  }

  /// Check if a specific plan has a feature.
  bool planHasFeature(String planCode, String featureKey) {
    final plan = _findPlan(planCode);
    for (final f in plan.features) {
      if (f.key == featureKey) return f.boolValue;
    }
    return false;
  }

  /// Get a limit value for a specific plan.
  int planGetLimit(String planCode, String featureKey) {
    final plan = _findPlan(planCode);
    for (final f in plan.features) {
      if (f.key == featureKey) return f.intValue;
    }
    return 0;
  }

  FeatureModel? _findFeature(String key) {
    for (final f in _license?.features ?? <FeatureModel>[]) {
      if (f.key == key) return f;
    }
    return null;
  }

  PlanModel _findPlan(String planCode) {
    for (final p in _plans) {
      if (p.code == planCode) return p;
    }
    return PlanModel.empty();
  }
}
