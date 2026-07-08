/// SDK configuration model.
class SdkConfig {
  final String serverUrl;
  final String projectApiKey;
  final String packageName;
  final String appVersion;
  final Duration refreshInterval;
  final bool autoRefresh;
  final bool autoTrial;

  const SdkConfig({
    required this.serverUrl,
    required this.projectApiKey,
    this.packageName = 'com.example.app',
    this.appVersion = '1.0.0',
    this.refreshInterval = const Duration(minutes: 60),
    this.autoRefresh = true,
    this.autoTrial = false,
  });

  SdkConfig copyWith({
    String? serverUrl,
    String? projectApiKey,
    String? packageName,
    String? appVersion,
    Duration? refreshInterval,
    bool? autoRefresh,
    bool? autoTrial,
  }) {
    return SdkConfig(
      serverUrl: serverUrl ?? this.serverUrl,
      projectApiKey: projectApiKey ?? this.projectApiKey,
      packageName: packageName ?? this.packageName,
      appVersion: appVersion ?? this.appVersion,
      refreshInterval: refreshInterval ?? this.refreshInterval,
      autoRefresh: autoRefresh ?? this.autoRefresh,
      autoTrial: autoTrial ?? this.autoTrial,
    );
  }
}
