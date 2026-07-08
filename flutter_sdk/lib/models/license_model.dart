/// License data model.
class LicenseModel {
  final String status;
  final String plan;
  final String planName;
  final String licenseKey;
  final String? expiresAt;
  final int daysRemaining;
  final int maxDevices;
  final int activatedDevices;
  final List<FeatureModel> features;

  LicenseModel({
    required this.status,
    required this.plan,
    required this.planName,
    required this.licenseKey,
    this.expiresAt,
    required this.daysRemaining,
    required this.maxDevices,
    required this.activatedDevices,
    required this.features,
  });

  bool get isActive => status == 'active' || status == 'trial';
  bool get isExpired => status == 'expired';
  bool get isTrial => status == 'trial';

  factory LicenseModel.fromJson(Map<String, dynamic> json) {
    final featuresList = json['features'] as List<dynamic>? ?? [];
    return LicenseModel(
      status: json['status'] as String? ?? 'inactive',
      plan: json['plan'] as String? ?? '',
      planName: json['planName'] as String? ?? '',
      licenseKey: json['licenseKey'] as String? ?? '',
      expiresAt: json['expiresAt'] as String?,
      daysRemaining: json['daysRemaining'] as int? ?? 0,
      maxDevices: json['maxDevices'] as int? ?? 1,
      activatedDevices: json['activatedDevices'] as int? ?? 0,
      features: featuresList
          .map((f) => FeatureModel.fromJson(f as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
    'status': status,
    'plan': plan,
    'planName': planName,
    'licenseKey': licenseKey,
    'expiresAt': expiresAt,
    'daysRemaining': daysRemaining,
    'maxDevices': maxDevices,
    'activatedDevices': activatedDevices,
    'features': features.map((f) => f.toJson()).toList(),
  };
}
