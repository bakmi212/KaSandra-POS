/// Device service for device identification and platform detection.
import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb, defaultTargetPlatform;

class DeviceService {
  Future<String> getDeviceName() async {
    if (kIsWeb) return 'Flutter Web';
    if (Platform.isAndroid) return 'Android Device';
    if (Platform.isIOS) return 'iOS Device';
    if (Platform.isWindows) return 'Windows';
    if (Platform.isMacOS) return 'macOS';
    if (Platform.isLinux) return 'Linux';
    return 'Unknown Device';
  }

  String getPlatform() {
    if (kIsWeb) return 'web';
    final platform = defaultTargetPlatform.toString();
    if (platform.contains('android')) return 'android';
    if (platform.contains('iOS')) return 'ios';
    return platform.split('.').last;
  }
}
