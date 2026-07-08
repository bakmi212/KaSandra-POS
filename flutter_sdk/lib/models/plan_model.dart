/// Plan model for available subscription plans.
class PlanModel {
  final String code;
  final String name;
  final double price;
  final int durationDays;
  final int maxDevices;
  final int trialDays;
  final List<FeatureModel> features;

  PlanModel({
    required this.code,
    required this.name,
    required this.price,
    required this.durationDays,
    required this.maxDevices,
    required this.trialDays,
    required this.features,
  });

  factory PlanModel.empty() => PlanModel(
    code: '',
    name: '',
    price: 0,
    durationDays: 30,
    maxDevices: 1,
    trialDays: 0,
    features: [],
  );

  factory PlanModel.fromJson(Map<String, dynamic> json) {
    final featuresList = json['features'] as List<dynamic>? ?? [];
    return PlanModel(
      code: json['code'] as String? ?? '',
      name: json['name'] as String? ?? '',
      price: (json['price'] as num?)?.toDouble() ?? 0,
      durationDays: json['durationDays'] as int? ?? 30,
      maxDevices: json['maxDevices'] as int? ?? 1,
      trialDays: json['trialDays'] as int? ?? 0,
      features: featuresList
          .map((f) => FeatureModel.fromJson(f as Map<String, dynamic>))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
    'code': code,
    'name': name,
    'price': price,
    'durationDays': durationDays,
    'maxDevices': maxDevices,
    'trialDays': trialDays,
    'features': features.map((f) => f.toJson()).toList(),
  };
}
