/// Package model for subscription packages.
import 'feature_model.dart';

class PackageModel {
  final String id;
  final String name;
  final String code;
  final double price;
  final int durationDays;
  final int maxDevices;
  final int trialDays;
  final String? label;
  final String? description;
  final List<String> menuPermissions;
  final List<FeatureModel> features;

  PackageModel({
    required this.id,
    required this.name,
    required this.code,
    required this.price,
    required this.durationDays,
    required this.maxDevices,
    required this.trialDays,
    this.label,
    this.description,
    required this.menuPermissions,
    required this.features,
  });

  String get formattedPrice => price > 0 ? 'Rp ${price.toInt()}' : 'Gratis';
  String get durationText => '$durationDays hari';
  String get deviceText => '$maxDevices perangkat';
  String? get labelText {
    switch (label) {
      case 'best_seller': return 'Best Seller';
      case 'recommended': return 'Rekomendasi';
      case 'popular': return 'Populer';
      case 'new': return 'Baru';
      case 'promo': return 'Promo';
      case 'enterprise': return 'Enterprise';
      default: return label;
    }
  }

  factory PackageModel.fromJson(Map<String, dynamic> json) {
    final menuPerms = (json['menuPermissions'] as List<dynamic>? ?? [])
        .map((e) => e.toString())
        .toList();
    final featuresList = (json['features'] as List<dynamic>? ?? [])
        .map((f) => FeatureModel.fromJson(f as Map<String, dynamic>))
        .toList();

    return PackageModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      code: json['code'] as String? ?? '',
      price: (json['price'] as num?)?.toDouble() ?? 0,
      durationDays: json['durationDays'] as int? ?? 30,
      maxDevices: json['maxDevices'] as int? ?? 1,
      trialDays: json['trialDays'] as int? ?? 0,
      label: json['label'] as String?,
      description: json['description'] as String?,
      menuPermissions: menuPerms,
      features: featuresList,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'code': code,
    'price': price,
    'durationDays': durationDays,
    'maxDevices': maxDevices,
    'trialDays': trialDays,
    'label': label,
    'description': description,
    'menuPermissions': menuPermissions,
    'features': features.map((f) => f.toJson()).toList(),
  };
}
