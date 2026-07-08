/// Package Selection Page - Display packages from server
import 'package:flutter/material.dart';
import 'package:ksandra_license/models/package_model.dart';
import 'package:ksandra_license/models/project_info_model.dart';
import 'package:ksandra_license/models/payment_config_model.dart';

class PackageSelectionPage extends StatefulWidget {
  final ProjectInfoModel project;
  final List<PackageModel> packages;
  final PaymentConfigModel paymentConfig;
  final String serverUrl;
  final String projectApiKey;
  final Function(PackageModel selectedPackage) onPackageSelected;

  const PackageSelectionPage({
    super.key,
    required this.project,
    required this.packages,
    required this.paymentConfig,
    required this.serverUrl,
    required this.projectApiKey,
    required this.onPackageSelected,
  });

  @override
  State<PackageSelectionPage> createState() => _PackageSelectionPageState();
}

class _PackageSelectionPageState extends State<PackageSelectionPage> {
  PackageModel? _selectedPackage;

  Color _getLabelColor(String? label) {
    switch (label) {
      case 'best_seller':
        return Colors.orange;
      case 'recommended':
        return Colors.green;
      case 'popular':
        return Colors.blue;
      case 'new':
        return Colors.purple;
      case 'promo':
        return Colors.red;
      case 'enterprise':
        return Colors.indigo;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.project.name),
        centerTitle: true,
        elevation: 0,
        scrolledUnderElevation: 4,
      ),
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Project header
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer,
                borderRadius: const BorderRadius.only(
                  bottomLeft: Radius.circular(24),
                  bottomRight: Radius.circular(24),
                ),
              ),
              child: Column(
                children: [
                  if (widget.project.logo != null)
                    Container(
                      width: 80,
                      height: 80,
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadius.circular(16),
                        image: DecorationImage(
                          image: NetworkImage(widget.project.logo!),
                          fit: BoxFit.contain,
                        ),
                      ),
                    )
                  else
                    Container(
                      width: 80,
                      height: 80,
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(
                        Icons.business,
                        size: 40,
                        color: Theme.of(context).colorScheme.onSurface,
                      ),
                    ),
                  Text(
                    widget.project.name,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Theme.of(context).colorScheme.onPrimaryContainer,
                    ),
                  ),
                  if (widget.project.description != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      widget.project.description!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onPrimaryContainer.withAlpha(200),
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ],
              ),
            ),

            // Packages section
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Pilih Paket',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Package cards
                  if (widget.packages.isEmpty)
                    Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          children: [
                            Icon(
                              Icons.inbox_outlined,
                              size: 64,
                              color: Theme.of(context).colorScheme.outline,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'Tidak ada paket tersedia',
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  else
                    ...widget.packages.map((pkg) => _buildPackageCard(pkg)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPackageCard(PackageModel pkg) {
    final isSelected = _selectedPackage?.id == pkg.id;
    final labelColor = _getLabelColor(pkg.label);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: isSelected
            ? Theme.of(context).colorScheme.primaryContainer
            : Theme.of(context).colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isSelected
              ? Theme.of(context).colorScheme.primary
              : Theme.of(context).colorScheme.outlineVariant,
          width: isSelected ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () {
            setState(() => _selectedPackage = pkg);
            Future.delayed(const Duration(milliseconds: 300), () {
              widget.onPackageSelected(pkg);
            });
          },
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header row
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        pkg.name,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    if (pkg.label != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: labelColor,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          pkg.labelText ?? pkg.label!,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                  ],
                ),

                // Description
                if (pkg.description != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    pkg.description!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],

                const SizedBox(height: 16),

                // Price and info
                Row(
                  crossAxisAlignment: CrossAxisAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      pkg.formattedPrice,
                      style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '/ ${pkg.durationText}',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 12),

                // Device limit
                Row(
                  children: [
                    Icon(
                      Icons.devices,
                      size: 18,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      pkg.maxDevices > 1 ? 'Hingga ${pkg.maxDevices} perangkat' : '1 perangkat',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),

                // Menu permissions
                if (pkg.menuPermissions.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  Text(
                    'Yang Anda Dapatkan',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: pkg.menuPermissions.map((perm) {
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.check_circle,
                              size: 16,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              perm,
                              style: const TextStyle(fontSize: 12),
                            ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ],

                const SizedBox(height: 20),

                // Action button
                SizedBox(
                  width: double.infinity,
                  height: 44,
                  child: ElevatedButton(
                    onPressed: () {
                      setState(() => _selectedPackage = pkg);
                      Future.delayed(const Duration(milliseconds: 200), () {
                        widget.onPackageSelected(pkg);
                      });
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Theme.of(context).colorScheme.primary,
                      foregroundColor: Theme.of(context).colorScheme.onPrimary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Pilih Paket'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
