/// Payment Page - Handle payment with dynamic methods from server
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ksandra_license/models/package_model.dart';
import 'package:ksandra_license/models/payment_config_model.dart';
import 'package:ksandra_license/models/project_info_model.dart';
import 'package:ksandra_license/models/subscription_model.dart';
import 'package:ksandra_license/license_sdk.dart';

import '../services/api_client.dart';

class PaymentPage extends StatefulWidget {
  final ProjectInfoModel project;
  final PackageModel selectedPackage;
  final PaymentConfigModel paymentConfig;
  final String serverUrl;
  final String projectApiKey;
  final Function(SubscriptionModel subscription, LicenseModel license) onPaymentComplete;

  const PaymentPage({
    super.key,
    required this.project,
    required this.selectedPackage,
    required this.paymentConfig,
    required this.serverUrl,
    required this.projectApiKey,
    required this.onPaymentComplete,
  });

  @override
  State<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends State<PaymentPage> {
  String? _selectedPaymentMethod;
  bool _loading = false;
  SubscriptionModel? _subscription;

  @override
  void initState() {
    super.initState();
    // Auto-select first available method
    final methods = widget.paymentConfig.availableMethods;
    if (methods.isNotEmpty) {
      _selectedPaymentMethod = methods.first.code;
    }
  }

  Future<void> _createSubscription() async {
    if (_selectedPaymentMethod == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pilih metode pembayaran terlebih dahulu')),
      );
      return;
    }

    setState(() => _loading = true);

    try {
      final api = ApiClient(
        serverUrl: widget.serverUrl,
        projectApiKey: widget.projectApiKey,
      );

      final result = await api.post('subscription/create', {
        'projectApiKey': widget.projectApiKey,
        'packageCode': widget.selectedPackage.code,
        'paymentMethod': _selectedPaymentMethod,
        'deviceId': DateTime.now().millisecondsSinceEpoch.toString(), // TODO: Get real device ID
        'customerName': 'Customer', // TODO: Get from form
      });

      if (result['success'] == true) {
        final subscription = SubscriptionModel.fromJson(result);

        if (_selectedPaymentMethod == 'midtrans') {
          // TODO: Open Midtrans payment flow
          _showMidtransPayment(subscription);
        } else {
          setState(() {
            _subscription = subscription;
          });
        }
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(result['message'] ?? 'Gagal membuat pesanan')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Terjadi kesalahan. Coba lagi.')),
      );
    } finally {
      setState(() => _loading = false);
    }
  }

  void _showMidtransPayment(SubscriptionModel subscription) {
    // TODO: Integrate with Midtrans SDK
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Midtrans Payment'),
        content: const Text(
          'Midtrans integration would open here.\n\n'
          'For demo, payment is simulated.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              _simulatePayment(subscription);
            },
            child: const Text('Simulate Payment'),
          ),
        ],
      ),
    );
  }

  Future<void> _simulatePayment(SubscriptionModel subscription) async {
    // For demo: simulate successful payment
    setState(() => _loading = true);

    try {
      final api = ApiClient(
        serverUrl: widget.serverUrl,
        projectApiKey: widget.projectApiKey,
      );

      // In real scenario, payment gateway would callback to server
      // For demo, we directly fetch subscription status
      final statusResult = await api.get('subscription/status', {
        'projectApiKey': widget.projectApiKey,
        'orderNumber': subscription.orderNumber,
      });

      final updatedSubscription = SubscriptionModel.fromJson(statusResult);

      // If paid, get license
      if (updatedSubscription.licenseKey != null) {
        // Create a mock license for demo
        final license = LicenseModel(
          status: 'active',
          plan: updatedSubscription.packageCode,
          planName: updatedSubscription.packageName,
          licenseKey: updatedSubscription.licenseKey!,
          daysRemaining: 30,
          maxDevices: widget.selectedPackage.maxDevices,
          activatedDevices: 1,
          features: [],
        );

        widget.onPaymentComplete(updatedSubscription, license);
      } else {
        setState(() => _subscription = updatedSubscription);
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Terjadi kesalahan')),
      );
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _confirmPayment() async {
    if (_subscription == null) return;

    setState(() => _loading = true);

    try {
      final api = ApiClient(
        serverUrl: widget.serverUrl,
        projectApiKey: widget.projectApiKey,
      );

      await api.post('subscription/confirm-payment', {
        'projectApiKey': widget.projectApiKey,
        'orderNumber': _subscription!.orderNumber,
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Pembayaran akan diverifikasi dalam 1x24 jam'),
          backgroundColor: Colors.green,
        ),
      );

      // Stay on page to show waiting status
      setState(() {}); // Refresh UI
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Terjadi kesalahan')),
      );
    } finally {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pembayaran'),
        centerTitle: true,
      ),
      body: _subscription != null
          ? _buildPaymentInstruction()
          : _buildPaymentSetup(),
    );
  }

  Widget _buildPaymentSetup() {
    final methods = widget.paymentConfig.availableMethods;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Order summary card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Ringkasan Pesanan',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.selectedPackage.name,
                          style: const TextStyle(fontSize: 16),
                        ),
                      ),
                      Text(
                        widget.selectedPackage.formattedPrice,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  const Divider(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Total',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      Text(
                        widget.selectedPackage.formattedPrice,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: Theme.of(context).colorScheme.primary,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Payment method selection
          Text(
            'Metode Pembayaran',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 12),

          if (methods.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  'Tidak ada metode pembayaran tersedia',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                  ),
                ),
              ),
            )
          else
            ...methods.map((method) => _buildPaymentMethodTile(method)),

          const SizedBox(height: 24),

          // Manual transfer details (if selected)
          if (_selectedPaymentMethod == 'manual_transfer')
            _buildManualTransferDetails(),

          const SizedBox(height: 24),

          // Create subscription button
          SizedBox(
            height: 48,
            child: ElevatedButton(
              onPressed: _loading || methods.isEmpty ? null : _createSubscription,
              style: ElevatedButton.styleFrom(
                backgroundColor: Theme.of(context).colorScheme.primary,
                foregroundColor: Theme.of(context).colorScheme.onPrimary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Bayar Sekarang'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPaymentMethodTile(PaymentMethod method) {
    final isSelected = _selectedPaymentMethod == method.code;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isSelected
              ? Theme.of(context).colorScheme.primary
              : Theme.of(context).colorScheme.outlineVariant,
          width: isSelected ? 2 : 1,
        ),
        color: isSelected
            ? Theme.of(context).colorScheme.primaryContainer.withAlpha(50)
            : null,
      ),
      child: RadioListTile<String>(
        value: method.code,
        groupValue: _selectedPaymentMethod,
        onChanged: (value) {
          setState(() => _selectedPaymentMethod = value);
        },
        title: Text(method.name),
        secondary: Icon(
          method.code == 'manual_transfer'
              ? Icons.account_balance
              : Icons.payment,
        ),
        activeColor: Theme.of(context).colorScheme.primary,
      ),
    );
  }

  Widget _buildManualTransferDetails() {
    final banks = widget.paymentConfig.manualTransfer.banks;
    final qrisImage = widget.paymentConfig.manualTransfer.qrisImage;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Instruksi Pembayaran',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 16),

            // Bank accounts
            ...banks.map((bank) => Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      bank.bankName,
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            bank.accountNumber,
                            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.bold,
                              letterSpacing: 2,
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.copy),
                          onPressed: () {
                            Clipboard.setData(ClipboardData(text: bank.accountNumber));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Nomor rekening disalin')),
                            );
                          },
                          tooltip: 'Salin',
                        ),
                      ],
                    ),
                    Text(
                      'a.n. ${bank.accountName}',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            )),

            // QRIS if available
            if (qrisImage != null) ...[
              const SizedBox(height: 8),
              Center(
                child: Container(
                  width: 200,
                  height: 200,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Image.network(qrisImage, fit: BoxFit.contain),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Atau scan QRIS di atas untuk pembayaran',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontSize: 12,
                ),
                textAlign: TextAlign.center,
              ),
            ],

            const SizedBox(height: 16),
            Text(
              widget.paymentConfig.manualTransfer.instructions,
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPaymentInstruction() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Status card
          Card(
            color: _subscription!.isWaitingPayment
                ? Colors.orange.shade50
                : _subscription!.isWaitingVerification
                    ? Colors.blue.shade50
                    : Colors.green.shade50,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(
                    _subscription!.isWaitingPayment
                        ? Icons.schedule
                        : _subscription!.isWaitingVerification
                            ? Icons.hourglass_top
                            : Icons.check_circle,
                    size: 48,
                    color: _subscription!.isWaitingPayment
                        ? Colors.orange
                        : _subscription!.isWaitingVerification
                            ? Colors.blue
                            : Colors.green,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _subscription!.statusText,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Order details
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Detail Pesanan',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  _buildDetailRow('No. Pesanan', _subscription!.orderNumber),
                  _buildDetailRow('Paket', _subscription!.packageName),
                  _buildDetailRow('Total', _subscription!.formattedAmount),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          if (_subscription!.isWaitingPayment) ...[
            // Confirm payment button
            SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: _loading ? null : _confirmPayment,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('Saya Sudah Bayar'),
              ),
            ),
          ],

          if (_subscription!.licenseKey != null) ...[
            // Show license key
            Card(
              color: Colors.green.shade50,
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Text(
                      'License Key Anda:',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.green),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              _subscription!.licenseKey!,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                letterSpacing: 1,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                          IconButton(
                            icon: const Icon(Icons.copy),
                            onPressed: () {
                              Clipboard.setData(ClipboardData(text: _subscription!.licenseKey!));
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('License key disalin')),
                              );
                            },
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}
