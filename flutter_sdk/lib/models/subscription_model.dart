/// Subscription order model.
class SubscriptionModel {
  final String id;
  final String orderNumber;
  final String packageName;
  final String packageCode;
  final double amount;
  final double taxAmount;
  final double totalAmount;
  final String currency;
  final String status;
  final String? paymentMethod;
  final String? licenseKey;
  final String? paidAt;
  final String? verifiedAt;
  final String createdAt;
  final String expiresAt;

  SubscriptionModel({
    required this.id,
    required this.orderNumber,
    required this.packageName,
    required this.packageCode,
    required this.amount,
    required this.taxAmount,
    required this.totalAmount,
    required this.currency,
    required this.status,
    this.paymentMethod,
    this.licenseKey,
    this.paidAt,
    this.verifiedAt,
    required this.createdAt,
    required this.expiresAt,
  });

  String get formattedAmount => 'Rp ${totalAmount.toInt()}';
  bool get isWaitingPayment => status == 'waiting_payment';
  bool get isWaitingVerification => status == 'waiting_verification';
  bool get isPaid => status == 'paid' || status == 'verified';
  bool get isFailed => status == 'failed';
  bool get isExpired => status == 'expired';
  bool get isCancelled => status == 'cancelled';

  String get statusText {
    switch (status) {
      case 'waiting_payment':
        return 'Menunggu Pembayaran';
      case 'waiting_verification':
        return 'Menunggu Verifikasi';
      case 'paid':
        return 'Pembayaran Berhasil';
      case 'verified':
        return 'Terverifikasi';
      case 'failed':
        return 'Pembayaran Gagal';
      case 'expired':
        return 'Kedaluwarsa';
      case 'cancelled':
        return 'Dibatalkan';
      default:
        return status;
    }
  }

  factory SubscriptionModel.fromJson(Map<String, dynamic> json) {
    final sub = json['subscription'] as Map<String, dynamic>? ?? json;
    return SubscriptionModel(
      id: sub['id'] as String? ?? '',
      orderNumber: sub['orderNumber'] as String? ?? '',
      packageName: sub['packageName'] as String? ?? '',
      packageCode: sub['packageCode'] as String? ?? '',
      amount: (sub['amount'] as num?)?.toDouble() ?? 0,
      taxAmount: (sub['taxAmount'] as num?)?.toDouble() ?? 0,
      totalAmount: (sub['totalAmount'] as num?)?.toDouble() ?? 0,
      currency: sub['currency'] as String? ?? 'IDR',
      status: sub['status'] as String? ?? 'waiting_payment',
      paymentMethod: sub['paymentMethod'] as String?,
      licenseKey: sub['licenseKey'] as String?,
      paidAt: sub['paidAt'] as String?,
      verifiedAt: sub['verifiedAt'] as String?,
      createdAt: sub['createdAt'] as String? ?? DateTime.now().toIso8601String(),
      expiresAt: sub['expiresAt'] as String? ?? DateTime.now().toIso8601String(),
    );
  }
}
