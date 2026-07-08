/// Project information model.
class ProjectInfoModel {
  final String id;
  final String name;
  final String? logo;
  final String? description;
  final String currency;
  final String timezone;
  final String? supportUrl;
  final bool maintenanceMode;
  final String? maintenanceMessage;

  ProjectInfoModel({
    required this.id,
    required this.name,
    this.logo,
    this.description,
    required this.currency,
    required this.timezone,
    this.supportUrl,
    required this.maintenanceMode,
    this.maintenanceMessage,
  });

  factory ProjectInfoModel.fromJson(Map<String, dynamic> json) {
    final project = json['project'] as Map<String, dynamic>? ?? {};
    return ProjectInfoModel(
      id: project['id'] as String? ?? json['id'] as String? ?? '',
      name: project['name'] as String? ?? json['name'] as String? ?? '',
      logo: project['logo'] as String? ?? json['logo'] as String?,
      description: project['description'] as String?,
      currency: project['currency'] as String? ?? 'IDR',
      timezone: project['timezone'] as String? ?? 'Asia/Jakarta',
      supportUrl: project['supportUrl'] as String?,
      maintenanceMode: project['maintenanceMode'] as bool? ?? false,
      maintenanceMessage: project['maintenanceMessage'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'logo': logo,
    'description': description,
    'currency': currency,
    'timezone': timezone,
    'supportUrl': supportUrl,
    'maintenanceMode': maintenanceMode,
    'maintenanceMessage': maintenanceMessage,
  };
}
