/// Dynamic Sidebar - Generated from menu_permissions
import 'package:flutter/material.dart';

class DynamicSidebar extends StatelessWidget {
  final List<String> menuPermissions;
  final String selectedItem;
  final Function(String) onItemSelected;
  final String? projectName;
  final String? projectLogo;

  const DynamicSidebar({
    super.key,
    required this.menuPermissions,
    required this.selectedItem,
    required this.onItemSelected,
    this.projectName,
    this.projectLogo,
  });

  IconData _getMenuIcon(String menu) {
    // Map menu names to icons
    final iconMap = {
      'dashboard': Icons.dashboard,
      'penjualan': Icons.point_of_sale,
      'pembelian': Icons.shopping_cart,
      'inventory': Icons.inventory,
      'stok': Icons.inventory_2,
      'produk': Icons.fastfood,
      'product': Icons.inventory,
      'customer': Icons.people,
      'pelanggan': Icons.people,
      'supplier': Icons.local_shipping,
      'laporan': Icons.assessment,
      'report': Icons.assessment,
      'absensi': Icons.access_time,
      'keuangan': Icons.account_balance_wallet,
      'finance': Icons.attach_money,
      'pengaturan': Icons.settings,
      'settings': Icons.settings,
      'pengguna': Icons.manage_accounts,
      'user': Icons.person,
      'users': Icons.group,
      'kitchen': Icons.kitchen,
      'dapur': Icons.restaurant,
      'order': Icons.receipt_long,
      'pesanan': Icons.list_alt,
      'delivery': Icons.delivery_dining,
      'pengiriman': Icons.local_shipping,
      'staff': Icons.badge,
      'karyawan': Icons.work,
      'branch': Icons.store,
      'cabang': Icons.store,
    };

    final key = menu.toLowerCase().replaceAll(' ', '_');
    return iconMap[key] ?? Icons.circle;
  }

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: Column(
        children: [
          // Header
          DrawerHeader(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (projectLogo != null)
                  Container(
                    width: 48,
                    height: 48,
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(12),
                      image: DecorationImage(
                        image: NetworkImage(projectLogo!),
                        fit: BoxFit.contain,
                      ),
                    ),
                  )
                else
                  Container(
                    width: 48,
                    height: 48,
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surface,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      Icons.business,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                Text(
                  projectName ?? 'KaSandra',
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.onPrimaryContainer,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Menu Dinamis',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onPrimaryContainer.withAlpha(180),
                  ),
                ),
              ],
            ),
          ),

          // Menu items
          Expanded(
            child: menuPermissions.isEmpty
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.menu,
                            size: 64,
                            color: Theme.of(context).colorScheme.outline,
                          ),
                          const SizedBox(height: 16),
                          Text(
                            'Tidak ada menu tersedia',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.onSurfaceVariant,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                  )
                : ListView.builder(
                    itemCount: menuPermissions.length,
                    itemBuilder: (context, index) {
                      final menu = menuPermissions[index];
                      final isSelected = selectedItem == menu;

                      return Container(
                        margin: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? Theme.of(context).colorScheme.primaryContainer
                              : null,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: ListTile(
                          leading: Icon(
                            _getMenuIcon(menu),
                            color: isSelected
                                ? Theme.of(context).colorScheme.primary
                                : Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                          title: Text(
                            menu,
                            style: TextStyle(
                              fontWeight:
                                  isSelected ? FontWeight.bold : FontWeight.normal,
                              color: isSelected
                                  ? Theme.of(context).colorScheme.primary
                                  : null,
                            ),
                          ),
                          selected: isSelected,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          onTap: () => onItemSelected(menu),
                        ),
                      );
                    },
                  ),
          ),

          // Footer
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Powered by KaSandra License',
              style: TextStyle(
                fontSize: 10,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}
