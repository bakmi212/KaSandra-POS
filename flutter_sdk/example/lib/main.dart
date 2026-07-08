/// Main app demonstrating KaSandra License SDK with dynamic menu.
import 'package:flutter/material.dart';
import 'package:ksandra_license/license_sdk.dart';
import 'package:ksandra_license/models/package_model.dart';
import 'package:ksandra_license/models/payment_config_model.dart';
import 'package:ksandra_license/models/project_info_model.dart';
import 'package:ksandra_license/models/subscription_model.dart';

import 'pages/connection_page.dart';
import 'pages/package_selection_page.dart';
import 'pages/payment_page.dart';
import 'pages/license_info_page.dart';
import 'widgets/dynamic_sidebar.dart';

void main() {
  runApp(const LicenseDemoApp());
}

class LicenseDemoApp extends StatelessWidget {
  const LicenseDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'KaSandra License Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.blue,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      themeMode: ThemeMode.system,
      home: const MainPage(),
    );
  }
}

class MainPage extends StatefulWidget {
  const MainPage({super.key});

  @override
  State<MainPage> createState() => _MainPageState();
}

class _MainPageState extends State<MainPage> {
  // Connection state
  final LicenseSDK _sdk = LicenseSDK();
  String? _serverUrl;
  String? _projectApiKey;
  ProjectInfoModel? _project;
  List<PackageModel> _packages = [];
  PaymentConfigModel? _paymentConfig;

  // License state
  bool _initialized = false;

  // UI state
  String _currentPage = '';
  List<String> _menuPermissions = [];

  @override
  void initState() {
    super.initState();
    _setupSdkListeners();
  }

  void _setupSdkListeners() {
    _sdk.onLicenseChanged = (license) {
      _updateMenuPermissions();
    };

    _sdk.onExpired = () {
      _showMessage('Lisensi Anda telah kedaluwarsa', isError: true);
      _updateMenuPermissions();
    };

    _sdk.onActivated = (license) {
      _showMessage('Lisensi berhasil diaktivasi');
      _updateMenuPermissions();
    };
  }

  void _updateMenuPermissions() {
    if (_sdk.isLicensed && _sdk.features.isNotEmpty) {
      // Get menu features from license
      final menus = _sdk.features
          .where((f) => f.type == 'menu' || f.boolValue)
          .map((f) => f.key)
          .toList();

      // If license has menu_permissions feature, use that
      final menuPermFeature = _sdk.features
          .where((f) => f.key == 'menu_permissions')
          .firstOrNull;

      if (menuPermFeature != null && menuPermFeature.stringValue.isNotEmpty) {
        try {
          final perms = menuPermFeature.stringValue.split(',');
          setState(() => _menuPermissions = perms);
        } catch (_) {}
      } else if (menus.isNotEmpty) {
        setState(() => _menuPermissions = menus);
      } else {
        // Use packages menu permissions
        final pkg = _packages.where((p) => p.code == _sdk.plan).firstOrNull;
        setState(() => _menuPermissions = pkg?.menuPermissions ?? []);
      }
    } else {
      setState(() => _menuPermissions = []);
    }

    if (_menuPermissions.isNotEmpty && _currentPage.isEmpty) {
      setState(() => _currentPage = _menuPermissions.first);
    }
  }

  Future<void> _initializeSdk() async {
    if (_serverUrl == null || _projectApiKey == null || _paymentConfig == null) return;

    try {
      await _sdk.initialize(
        serverUrl: _serverUrl!,
        projectApiKey: _projectApiKey!,
        packageName: 'com.ksandra.demo',
        appVersion: '1.0.0',
        autoRefresh: true,
        refreshInterval: const Duration(minutes: 30),
      );

      setState(() => _initialized = true);
      _updateMenuPermissions();
    } catch (e) {
      _showMessage('Gagal menginisialisasi lisensi', isError: true);
    }
  }

  void _onConnected(
    ProjectInfoModel project,
    List<PackageModel> packages,
    PaymentConfigModel paymentConfig,
    String serverUrl,
    String projectApiKey,
  ) {
    setState(() {
      _project = project;
      _packages = packages;
      _paymentConfig = paymentConfig;
      _serverUrl = serverUrl;
      _projectApiKey = projectApiKey;
    });
  }

  void _onPackageSelected(PackageModel pkg) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => PaymentPage(
          project: _project!,
          selectedPackage: pkg,
          paymentConfig: _paymentConfig!,
          serverUrl: _serverUrl!,
          projectApiKey: _projectApiKey!,
          onPaymentComplete: _onPaymentComplete,
        ),
      ),
    );
  }

  void _onPaymentComplete(SubscriptionModel subscription, LicenseModel license) {
    Navigator.popUntil(context, (route) => route.isFirst);
    _initializeSdk();
  }

  void _onDisconnect() {
    setState(() {
      _serverUrl = null;
      _projectApiKey = null;
      _project = null;
      _packages = [];
      _paymentConfig = null;
      _initialized = false;
      _currentPage = '';
      _menuPermissions = [];
    });

    _sdk.dispose();
    _showMessage('Koneksi diputuskan');
  }

  void _onRefresh() {
    _sdk.refresh();
    _showMessage('Lisensi disegarkan');
  }

  void _showMessage(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // No connection yet
    if (_project == null) {
      return ConnectionPage(onConnected: _onConnected);
    }

    // Show packages if no license
    if (!_initialized || !_sdk.isLicensed) {
      return PackageSelectionPage(
        project: _project!,
        packages: _packages,
        paymentConfig: _paymentConfig!,
        serverUrl: _serverUrl!,
        projectApiKey: _projectApiKey!,
        onPackageSelected: _onPackageSelected,
      );
    }

    // Main app with dynamic sidebar
    return Scaffold(
      appBar: AppBar(
        title: Text(_currentPage.isNotEmpty ? _currentPage : 'Dashboard'),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.info_outline),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => Scaffold(
                    appBar: AppBar(title: const Text('Informasi Lisensi')),
                    body: LicenseInfoPage(
                      sdk: _sdk,
                      project: _project!,
                      onDisconnect: _onDisconnect,
                      onRefresh: _onRefresh,
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
      drawer: DynamicSidebar(
        menuPermissions: _menuPermissions,
        selectedItem: _currentPage,
        onItemSelected: (menu) {
          setState(() => _currentPage = menu);
          Navigator.pop(context);
        },
        projectName: _project?.name,
        projectLogo: _project?.logo,
      ),
      body: _buildPageContent(),
    );
  }

  Widget _buildPageContent() {
    if (_menuPermissions.isEmpty) {
      return _buildEmptyMenu();
    }

    // Dynamic page content based on menu
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Icon(
              Icons.check_circle,
              size: 40,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            '$_currentPage',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            'Menu ini dimuat secara dinamis dari License Server',
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          Card(
            margin: const EdgeInsets.symmetric(horizontal: 24),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Informasi Lisensi:',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  _infoRow('Status', _sdk.isLicensed ? 'Aktif' : 'Tidak Aktif'),
                  _infoRow('Paket', _sdk.planName),
                  _infoRow('Sisa Hari', '${_sdk.daysRemaining} hari'),
                  _infoRow(
                    'Features Aktif',
                    '${_sdk.features.length} fitur',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyMenu() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.menu_open,
              size: 64,
              color: Theme.of(context).colorScheme.outline,
            ),
            const SizedBox(height: 16),
            Text(
              'Tidak ada menu tersedia',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              'Lisensi Anda tidak memiliki akses menu.\nHubungi administrator untuk informasi lebih lanjut.',
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
