/// Feature flag model.
class FeatureModel {
  final String key;
  final String type;
  final dynamic value;

  FeatureModel({
    required this.key,
    required this.type,
    required this.value,
  });

  bool get boolValue => value == true || value == 'true';
  int get intValue => value is int ? value as int : int.tryParse('$value') ?? 0;
  String get stringValue => '$value';

  factory FeatureModel.fromJson(Map<String, dynamic> json) {
    return FeatureModel(
      key: json['key'] as String? ?? '',
      type: json['type'] as String? ?? '',
      value: json['value'],
    );
  }

  Map<String, dynamic> toJson() => {'key': key, 'type': type, 'value': value};
}
