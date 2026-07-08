/// License Info Page - Display license status and sync info
import 'package:flutter/material.dart';
import 'package:ksandra_license/license_sdk.dart';
import 'package:ksandra_license/models/project_info_model.dart';

class LicenseInfoPage extends StatelessWidget {
  final LicenseSDK sdk;
  final ProjectInfoModel project;
  final VoidCallback onDisconnect;
  final VoidCallback onRefresh;

  const LicenseInfoPage({
    super.key,
    required this.sdk,
    required this.project,
    required this.onDisconnect,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Status header
          _buildStatusHeader(context),

          const SizedBox(height: 24),

          // Project info
          _buildSection(
            context,
            'Informasi Proyek',
            [
              _buildInfoRow(context, 'Proyek', project.name),
              if (project.description != null)
                _buildInfoRow(context, 'Deskripsi', project.description!),
              _buildInfoRow(context, 'Mata Uang', project.currency),
            ],
          ),

          const SizedBox(height: 16),

          // License info
          _buildSection(
            context,
            'Informasi Lisensi',
            [
              _buildInfoRow(
                context,
                'Status',
                _getStatusText(sdk.status),
                trailing: _buildStatusBadge(context, sdk.status),
              ),
              _buildInfoRow(context, 'Paket', sdk.planName.isNotEmpty ? sdk.planName : '-'),
              _buildInfoRow(context, 'License Key', sdk.licenseKey.isNotEmpty ? _maskLicenseKey(sdk.licenseKey) : '-'),
              _buildInfoRow(context, 'Masa Berlaku', '${sdk.daysRemaining} hari'),
              if (sdk.expiresAt != null)
                _buildInfoRow(context, 'Berlaku Hingga', sdk.expiresAt!),
              _buildInfoRow(context, 'Perangkat', '${sdk.activatedDevices}/${sdk.maxDevices}'),
            ],
          ),

          const SizedBox(height: 16),

          // Connection info
          _buildSection(
            context,
            'Informasi Koneksi',
            [
              _buildInfoRow(
                context,
                'Status Koneksi',
                'Terhubung',
                trailing: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: Colors.green,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
              if (sdk.lastRefresh != null)
                _buildInfoRow(
                  context,
                  'Sinkronisasi Terakhir',
                  _formatDateTime(sdk.lastRefresh!),
                ),
            ],
          ),

          const SizedBox(height: 24),

          // Actions
          SizedBox(
            height: 48,
            child: ElevatedButton.icon(
              onPressed: onRefresh,
              icon: const Icon(Icons.refresh),
              label: const Text('Refresh Lisensi'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.primary,
                foregroundColor: Theme.of(context).colorScheme.onPrimary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),

          const SizedBox(height: 12),

          SizedBox(
            height: 48,
            child: OutlinedButton.icon(
              onPressed: () => _showDisconnectConfirm(context),
              icon: const Icon(Icons.link_off),
              label: const Text('Putuskan Koneksi'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Theme.of(context).colorScheme.error,
                side: BorderSide(
                  color: Theme.of(context).colorScheme.error,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusHeader(BuildContext context) {
    return Card(
      color: sdk.isLicensed
          ? Colors.green.shade50
          : sdk.isExpired
              ? Colors.red.shade50
              : Colors.grey.shade100,
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: sdk.isLicensed
                    ? Colors.green.shade100
                    : sdk.isExpired
                        ? Colors.red.shade100
                        : Colors.grey.shade200,
                shape: BoxShape.circle,
              ),
              child: Icon(
                sdk.isLicensed
                    ? Icons.verified
                    : sdk.isExpired
                        ? Icons.event_busy
                        : Icons.key_off,
                size: 32,
                color: sdk.isLicensed
                    ? Colors.green
                    : sdk.isExpired
                        ? Colors.red
                        : Colors.grey,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              sdk.isLicensed
                  ? 'Lisensi Aktif'
                  : sdk.isExpired
                      ? 'Lisensi Kedaluwarsa'
                      : 'Tidak Ada Lisensi',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            if (sdk.isLicensed && sdk.isTrial)
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.blue.shade100,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  'Trial',
                  style: TextStyle(
                    color: Colors.blue.shade800,
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSection(BuildContext context, String title, List<Widget> children) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildInfoRow(BuildContext context, String label, String value, {Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          if (trailing != null) trailing,
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w500),
              textAlign: TextAlign.end,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(BuildContext context, String status) {
    Color color;
    switch (status) {
      case 'active':
        color = Colors.green;
        break;
      case 'trial':
        color = Colors.blue;
        break;
      case 'expired':
        color = Colors.red;
        break;
      default:
        color = Colors.grey;
    }

    return Container(
      width: 12,
      height: 12,
      margin: const EdgeInsets.only(right: 8),
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
    );
  }

  String _getStatusText(String status) {
    switch (status) {
      case 'active':
        return 'Aktif';
      case 'trial':
        return 'Trial';
      case 'expired':
        return 'Kedaluwarsa';
      case 'inactive':
        return 'Tidak Aktif';
      default:
        return status;
    }
  }

  String _maskLicenseKey(String key) {
    if (key.length <= 8) return key;
    return '${key.substring(0, 4)}****${key.substring(key.length - 4)}';
  }

  String _formatDateTime(DateTime dt) {
    return '${dt.day}/${dt.month}/${dt.year} ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
  }

  void _showDisconnectConfirm(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Putuskan Koneksi'),
        content: const Text(
          'Apakah Anda yakin ingin memutuskan koneksi?\n\n'
          'Semua data akan dihapus dari perangkat ini.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              onDisconnect();
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
            child: const Text('Putuskan'),
          ),
        ],
      ),
    );
  }
}
