/// Connection Page - Enter Server URL and Connection Key
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ksandra_license/license_sdk.dart';
import 'package:ksandra_license/models/package_model.dart';
import 'package:ksandra_license/models/payment_config_model.dart';
import 'package:ksandra_license/models/project_info_model.dart';

class ConnectionPage extends StatefulWidget {
  final Function(ProjectInfoModel project, List<PackageModel> packages, PaymentConfigModel paymentConfig, String serverUrl, String projectApiKey) onConnected;

  const ConnectionPage({super.key, required this.onConnected});

  @override
  State<ConnectionPage> createState() => _ConnectionPageState();
}

class _ConnectionPageState extends State<ConnectionPage> {
  final _serverUrlController = TextEditingController();
  final _projectApiKeyController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Auto-paste from clipboard
    _tryPasteFromClipboard();
  }

  Future<void> _tryPasteFromClipboard() async {
    final clipboardData = await Clipboard.getData(Clipboard.kTextPlain);
    if (clipboardData.text != null && clipboardData.text!.isNotEmpty) {
      // Check if it looks like a connection key format
      final text = clipboardData.text!.trim();
      if (text.contains('ksandra_') || text.length > 20) {
        setState(() {
          _projectApiKeyController.text = text;
        });
      }
    }
  }

  Future<void> _connect() async {
    final serverUrl = _serverUrlController.text.trim();
    final projectApiKey = _projectApiKeyController.text.trim();

    if (serverUrl.isEmpty) {
      setState(() => _error = 'Server URL tidak boleh kosong');
      return;
    }

    if (projectApiKey.isEmpty) {
      setState(() => _error = 'Connection Key tidak boleh kosong');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final api = ApiClient(serverUrl: serverUrl, projectApiKey: projectApiKey);

      // Test connection
      final connectResult = await api.post('connect', {
        'projectApiKey': projectApiKey,
      });

      if (connectResult['success'] != true) {
        setState(() {
          _error = connectResult['message'] ?? 'Connection Key tidak valid';
          _loading = false;
        });
        return;
      }

      final project = ProjectInfoModel.fromJson(connectResult);

      // Fetch packages
      final packagesResult = await api.get('packages', {
        'projectApiKey': projectApiKey,
      });

      final packages = (packagesResult['packages'] as List<dynamic>? ?? [])
          .map((p) => PackageModel.fromJson(p as Map<String, dynamic>))
          .toList();

      // Fetch payment config
      final paymentResult = await api.get('payment/config', {
        'projectApiKey': projectApiKey,
      });

      final paymentConfig = PaymentConfigModel.fromJson(paymentResult);

      widget.onConnected(project, packages, paymentConfig, serverUrl, projectApiKey);
    } catch (e) {
      setState(() {
        _error = 'Tidak dapat terhubung ke server. Periksa Server URL dan koneksi internet.';
        _loading = false;
      });
    }
  }

  @override
  void dispose() {
    _serverUrlController.dispose();
    _projectApiKeyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Logo placeholder
                  Container(
                    width: 80,
                    height: 80,
                    margin: const EdgeInsets.only(bottom: 32),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Icon(
                      Icons.key_rounded,
                      size: 40,
                      color: Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
                  ),

                  Text(
                    'Koneksi Lisensi',
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Masukkan Server URL dan Connection Key untuk terhubung',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),

                  // Server URL input
                  TextField(
                    controller: _serverUrlController,
                    decoration: InputDecoration(
                      labelText: 'Server URL',
                      hintText: 'https://your-server.com/api',
                      prefixIcon: const Icon(Icons.cloud_outlined),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      filled: true,
                      fillColor: Theme.of(context).colorScheme.surfaceContainerLowest,
                    ),
                    keyboardType: TextInputType.url,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: 16),

                  // Connection Key input
                  TextField(
                    controller: _projectApiKeyController,
                    decoration: InputDecoration(
                      labelText: 'Connection Key',
                      hintText: 'ksandra_prod_xxxxxx',
                      prefixIcon: const Icon(Icons.vpn_key_outlined),
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.paste),
                        onPressed: () async {
                          final clipboardData = await Clipboard.getData(Clipboard.kTextPlain);
                          if (clipboardData.text != null) {
                            _projectApiKeyController.text = clipboardData.text!.trim();
                          }
                        },
                        tooltip: 'Paste',
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      filled: true,
                      fillColor: Theme.of(context).colorScheme.surfaceContainerLowest,
                    ),
                    obscureText: true,
                  ),
                  const SizedBox(height: 24),

                  // Error message
                  if (_error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.error_outline,
                            color: Theme.of(context).colorScheme.error,
                            size: 20,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              _error!,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.onErrorContainer,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Connect button
                  SizedBox(
                    height: 48,
                    child: ElevatedButton.icon(
                      onPressed: _loading ? null : _connect,
                      icon: _loading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.link),
                      label: Text(_loading ? 'Menghubungkan...' : 'Hubungkan'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Theme.of(context).colorScheme.primary,
                        foregroundColor: Theme.of(context).colorScheme.onPrimary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
