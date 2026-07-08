/// Payment configuration model.
class PaymentConfigModel {
  final ManualTransferConfig manualTransfer;
  final MidtransConfig midtrans;
  final PaymentProviderConfig tripay;
  final PaymentProviderConfig xendit;
  final PaymentProviderConfig duitku;
  final String currency;
  final double taxRate;

  PaymentConfigModel({
    required this.manualTransfer,
    required this.midtrans,
    required this.tripay,
    required this.xendit,
    required this.duitku,
    required this.currency,
    required this.taxRate,
  });

  factory PaymentConfigModel.fromJson(Map<String, dynamic> json) {
    final payment = json['payment'] as Map<String, dynamic>? ?? {};

    return PaymentConfigModel(
      manualTransfer: ManualTransferConfig.fromJson(
        payment['manualTransfer'] as Map<String, dynamic>? ?? {},
      ),
      midtrans: MidtransConfig.fromJson(
        payment['midtrans'] as Map<String, dynamic>? ?? {},
      ),
      tripay: PaymentProviderConfig.fromJson(
        payment['tripay'] as Map<String, dynamic>? ?? {},
      ),
      xendit: PaymentProviderConfig.fromJson(
        payment['xendit'] as Map<String, dynamic>? ?? {},
      ),
      duitku: PaymentProviderConfig.fromJson(
        payment['duitku'] as Map<String, dynamic>? ?? {},
      ),
      currency: json['currency'] as String? ?? 'IDR',
      taxRate: (json['taxRate'] as num?)?.toDouble() ?? 0,
    );
  }

  List<PaymentMethod> get availableMethods {
    final methods = <PaymentMethod>[];
    if (manualTransfer.enabled) {
      methods.add(PaymentMethod(
        name: 'Transfer Manual',
        code: 'manual_transfer',
        icon: 'bank_transfer',
      ));
    }
    if (midtrans.enabled) {
      methods.add(PaymentMethod(
        name: 'Midtrans',
        code: 'midtrans',
        icon: 'credit_card',
      ));
    }
    if (tripay.enabled) {
      methods.add(PaymentMethod(
        name: 'Tripay',
        code: 'tripay',
        icon: 'payment',
      ));
    }
    if (xendit.enabled) {
      methods.add(PaymentMethod(
        name: 'Xendit',
        code: 'xendit',
        icon: 'payment',
      ));
    }
    if (duitku.enabled) {
      methods.add(PaymentMethod(
        name: 'Duitku',
        code: 'duitku',
        icon: 'payment',
      ));
    }
    return methods;
  }
}

class ManualTransferConfig {
  final bool enabled;
  final List<BankAccount> banks;
  final String? qrisImage;
  final String instructions;
  final int verificationTimeHours;

  ManualTransferConfig({
    required this.enabled,
    required this.banks,
    this.qrisImage,
    required this.instructions,
    required this.verificationTimeHours,
  });

  factory ManualTransferConfig.fromJson(Map<String, dynamic> json) {
    final banksList = (json['banks'] as List<dynamic>? ?? [])
        .map((b) => BankAccount.fromJson(b as Map<String, dynamic>))
        .toList();

    return ManualTransferConfig(
      enabled: json['enabled'] as bool? ?? false,
      banks: banksList,
      qrisImage: json['qrisImage'] as String?,
      instructions: json['instructions'] as String? ?? '',
      verificationTimeHours: json['verificationTimeHours'] as int? ?? 24,
    );
  }
}

class BankAccount {
  final String bankName;
  final String accountNumber;
  final String accountName;

  BankAccount({
    required this.bankName,
    required this.accountNumber,
    required this.accountName,
  });

  factory BankAccount.fromJson(Map<String, dynamic> json) {
    return BankAccount(
      bankName: json['bankName'] as String? ?? '',
      accountNumber: json['accountNumber'] as String? ?? '',
      accountName: json['accountName'] as String? ?? '',
    );
  }
}

class MidtransConfig {
  final bool enabled;
  final String? clientKey;
  final bool isProduction;

  MidtransConfig({
    required this.enabled,
    this.clientKey,
    required this.isProduction,
  });

  factory MidtransConfig.fromJson(Map<String, dynamic> json) {
    return MidtransConfig(
      enabled: json['enabled'] as bool? ?? false,
      clientKey: json['clientKey'] as String?,
      isProduction: json['isProduction'] as bool? ?? false,
    );
  }
}

class PaymentProviderConfig {
  final bool enabled;

  PaymentProviderConfig({required this.enabled});

  factory PaymentProviderConfig.fromJson(Map<String, dynamic> json) {
    return PaymentProviderConfig(
      enabled: json['enabled'] as bool? ?? false,
    );
  }
}

class PaymentMethod {
  final String name;
  final String code;
  final String icon;

  PaymentMethod({
    required this.name,
    required this.code,
    required this.icon,
  });
}
