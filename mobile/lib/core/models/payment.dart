import 'enums.dart';
import 'json.dart';

/// `PaymentOrderOut` (PLAN §8.11). [amountMinor]/[currency] are what the patient pays;
/// [baseAmountMinor]/[baseCurrency] (INR) are the ledger amounts.
class PaymentOrder {
  const PaymentOrder({
    required this.id,
    required this.orderNumber,
    required this.purpose,
    required this.status,
    required this.gateway,
    required this.amountMinor,
    required this.currency,
    this.baseAmountMinor = 0,
    this.baseCurrency = 'INR',
    this.fxRate,
    this.bookingId,
    this.installmentId,
    this.consultationId,
    this.gatewayOrderId,
    this.createdAt,
    this.paidAt,
    this.expiresAt,
  });

  factory PaymentOrder.fromJson(JsonMap j) => PaymentOrder(
    id: jStr(j, 'id'),
    orderNumber: jStr(j, 'order_number'),
    purpose: PaymentPurpose.fromJson(j['purpose']),
    status: OrderStatus.fromJson(j['status']),
    gateway: PaymentGateway.fromJson(j['gateway']),
    amountMinor: jInt(j, 'amount_minor'),
    currency: jStr(j, 'currency', 'USD'),
    baseAmountMinor: jInt(j, 'base_amount_minor'),
    baseCurrency: jStr(j, 'base_currency', 'INR'),
    fxRate: jDoubleOrNull(j, 'fx_rate'),
    bookingId: jStrOrNull(j, 'booking_id'),
    installmentId: jStrOrNull(j, 'installment_id'),
    consultationId: jStrOrNull(j, 'consultation_id'),
    gatewayOrderId: jStrOrNull(j, 'gateway_order_id'),
    createdAt: jDate(j, 'created_at'),
    paidAt: jDate(j, 'paid_at'),
    expiresAt: jDate(j, 'expires_at'),
  );

  final String id;
  final String orderNumber;
  final PaymentPurpose purpose;
  final OrderStatus status;
  final PaymentGateway gateway;
  final int amountMinor;
  final String currency;
  final int baseAmountMinor;
  final String baseCurrency;
  final double? fxRate;
  final String? bookingId;
  final String? installmentId;
  final String? consultationId;
  final String? gatewayOrderId;
  final DateTime? createdAt;
  final DateTime? paidAt;
  final DateTime? expiresAt;

  bool get isPaid =>
      status == OrderStatus.paid || status == OrderStatus.partiallyRefunded || status == OrderStatus.refunded;
  bool get isFinal =>
      isPaid || status == OrderStatus.failed || status == OrderStatus.expired || status == OrderStatus.cancelled;

  Map<String, dynamic> toJson() => {
    'id': id,
    'order_number': orderNumber,
    'purpose': purpose.json,
    'status': status.json,
    'gateway': gateway.json,
    'amount_minor': amountMinor,
    'currency': currency,
    'base_amount_minor': baseAmountMinor,
    'base_currency': baseCurrency,
    'fx_rate': fxRate,
    'booking_id': bookingId,
    'installment_id': installmentId,
    'consultation_id': consultationId,
    'gateway_order_id': gatewayOrderId,
    'created_at': createdAt?.toUtc().toIso8601String(),
    'paid_at': paidAt?.toUtc().toIso8601String(),
    'expires_at': expiresAt?.toUtc().toIso8601String(),
  };
}

/// Razorpay checkout options returned by the server (`CheckoutOut.razorpay`).
class RazorpayCheckout {
  const RazorpayCheckout({
    required this.keyId,
    required this.orderId,
    required this.amount,
    required this.currency,
    this.name,
    this.description,
    this.prefillName,
    this.prefillEmail,
    this.prefillContact,
  });

  factory RazorpayCheckout.fromJson(JsonMap j) {
    final prefill = jMap(j, 'prefill');
    return RazorpayCheckout(
      keyId: jStr(j, 'key_id'),
      orderId: jStr(j, 'order_id'),
      amount: jInt(j, 'amount'),
      currency: jStr(j, 'currency'),
      name: jStrOrNull(j, 'name'),
      description: jStrOrNull(j, 'description'),
      prefillName: jStrOrNull(prefill, 'name'),
      prefillEmail: jStrOrNull(prefill, 'email'),
      prefillContact: jStrOrNull(prefill, 'contact'),
    );
  }

  final String keyId;
  final String orderId;

  /// Minor units.
  final int amount;
  final String currency;
  final String? name;
  final String? description;
  final String? prefillName;
  final String? prefillEmail;
  final String? prefillContact;

  /// Options map for `Razorpay().open(options)` (razorpay_flutter).
  Map<String, dynamic> toRazorpayOptions() => compactJson({
    'key': keyId,
    'order_id': orderId,
    'amount': amount,
    'currency': currency,
    'name': name ?? 'Heal India Global',
    'description': description,
    'prefill': compactJson({'name': prefillName, 'email': prefillEmail, 'contact': prefillContact}),
  });

  Map<String, dynamic> toJson() => {
    'key_id': keyId,
    'order_id': orderId,
    'amount': amount,
    'currency': currency,
    'name': name,
    'description': description,
    'prefill': {'name': prefillName, 'email': prefillEmail, 'contact': prefillContact},
  };
}

/// Stripe PaymentIntent data (`CheckoutOut.stripe`).
class StripeCheckout {
  const StripeCheckout({required this.publishableKey, required this.clientSecret});

  factory StripeCheckout.fromJson(JsonMap j) =>
      StripeCheckout(publishableKey: jStr(j, 'publishable_key'), clientSecret: jStr(j, 'client_secret'));

  final String publishableKey;
  final String clientSecret;

  Map<String, dynamic> toJson() => {'publishable_key': publishableKey, 'client_secret': clientSecret};
}

/// Bank transfer (SWIFT) instructions (`CheckoutOut.bank_transfer`).
class BankTransferDetails {
  const BankTransferDetails({
    required this.beneficiaryName,
    required this.bankName,
    required this.accountNumber,
    required this.reference,
    this.ifsc,
    this.swift,
    this.iban,
  });

  factory BankTransferDetails.fromJson(JsonMap j) => BankTransferDetails(
    beneficiaryName: jStr(j, 'beneficiary_name'),
    bankName: jStr(j, 'bank_name'),
    accountNumber: jStr(j, 'account_number'),
    ifsc: jStrOrNull(j, 'ifsc'),
    swift: jStrOrNull(j, 'swift'),
    iban: jStrOrNull(j, 'iban'),
    reference: jStr(j, 'reference'),
  );

  final String beneficiaryName;
  final String bankName;
  final String accountNumber;
  final String? ifsc;
  final String? swift;
  final String? iban;

  /// Payment reference the patient must quote on the transfer.
  final String reference;

  Map<String, dynamic> toJson() => {
    'beneficiary_name': beneficiaryName,
    'bank_name': bankName,
    'account_number': accountNumber,
    'ifsc': ifsc,
    'swift': swift,
    'iban': iban,
    'reference': reference,
  };
}

/// `CheckoutOut` (PLAN §8.11) returned by `POST /payments/orders`.
class Checkout {
  const Checkout({
    required this.order,
    required this.gateway,
    this.razorpay,
    this.stripe,
    this.bankTransfer,
    this.mockCompleteUrl,
  });

  factory Checkout.fromJson(JsonMap j) => Checkout(
    order: PaymentOrder.fromJson(jMap(j, 'order')),
    gateway: PaymentGateway.fromJson(j['gateway']),
    razorpay: jObj(j, 'razorpay', RazorpayCheckout.fromJson),
    stripe: jObj(j, 'stripe', StripeCheckout.fromJson),
    bankTransfer: jObj(j, 'bank_transfer', BankTransferDetails.fromJson),
    mockCompleteUrl: jStrOrNull(jMap(j, 'mock'), 'complete_url'),
  );

  final PaymentOrder order;
  final PaymentGateway gateway;
  final RazorpayCheckout? razorpay;
  final StripeCheckout? stripe;
  final BankTransferDetails? bankTransfer;

  /// Set for the `mock` gateway (dev only).
  final String? mockCompleteUrl;

  Map<String, dynamic> toJson() => {
    'order': order.toJson(),
    'gateway': gateway.json,
    'razorpay': razorpay?.toJson(),
    'stripe': stripe?.toJson(),
    'bank_transfer': bankTransfer?.toJson(),
    'mock': mockCompleteUrl == null ? null : {'complete_url': mockCompleteUrl},
  };
}

/// `InstallmentOut` (PLAN §4.11).
class Installment {
  const Installment({
    required this.id,
    required this.bookingId,
    required this.seq,
    required this.amountMinor,
    required this.currency,
    required this.status,
    this.dueDate,
    this.orderId,
    this.paidAt,
  });

  factory Installment.fromJson(JsonMap j) => Installment(
    id: jStr(j, 'id'),
    bookingId: jStr(j, 'booking_id'),
    seq: jInt(j, 'seq'),
    dueDate: jDay(j, 'due_date'),
    amountMinor: jInt(j, 'amount_minor'),
    currency: jStr(j, 'currency', 'INR'),
    status: InstallmentStatus.fromJson(j['status']),
    orderId: jStrOrNull(j, 'order_id'),
    paidAt: jDate(j, 'paid_at'),
  );

  final String id;
  final String bookingId;
  final int seq;
  final DateTime? dueDate;
  final int amountMinor;
  final String currency;
  final InstallmentStatus status;
  final String? orderId;
  final DateTime? paidAt;

  bool get isPayable => status == InstallmentStatus.due || status == InstallmentStatus.overdue;

  Map<String, dynamic> toJson() => {
    'id': id,
    'booking_id': bookingId,
    'seq': seq,
    'due_date': dueDate == null ? null : toApiDate(dueDate!),
    'amount_minor': amountMinor,
    'currency': currency,
    'status': status.json,
    'order_id': orderId,
    'paid_at': paidAt?.toUtc().toIso8601String(),
  };
}

/// Invoice line (`invoices.line_items[]`).
class InvoiceLine {
  const InvoiceLine({required this.description, required this.amountMinor, this.taxMinor = 0, this.quantity = 1});

  factory InvoiceLine.fromJson(JsonMap j) => InvoiceLine(
    description: jStr(j, 'description'),
    amountMinor: jInt(j, 'amount_minor'),
    taxMinor: jInt(j, 'tax_minor'),
    quantity: jInt(j, 'quantity', 1),
  );

  final String description;
  final int amountMinor;
  final int taxMinor;
  final int quantity;

  Map<String, dynamic> toJson() => {
    'description': description,
    'amount_minor': amountMinor,
    'tax_minor': taxMinor,
    'quantity': quantity,
  };
}

/// Patient receipt (`GET /payments/invoices`).
class Invoice {
  const Invoice({
    required this.id,
    required this.invoiceNumber,
    required this.kind,
    required this.totalMinor,
    required this.currency,
    this.bookingId,
    this.orderId,
    this.lineItems = const [],
    this.subtotalMinor = 0,
    this.taxMinor = 0,
    this.issuedAt,
  });

  factory Invoice.fromJson(JsonMap j) => Invoice(
    id: jStr(j, 'id'),
    invoiceNumber: jStr(j, 'invoice_number'),
    kind: InvoiceKind.fromJson(j['kind']),
    bookingId: jStrOrNull(j, 'booking_id'),
    orderId: jStrOrNull(j, 'order_id'),
    lineItems: jList(j, 'line_items', InvoiceLine.fromJson),
    subtotalMinor: jInt(j, 'subtotal_minor'),
    taxMinor: jInt(j, 'tax_minor'),
    totalMinor: jInt(j, 'total_minor'),
    currency: jStr(j, 'currency', 'INR'),
    issuedAt: jDate(j, 'issued_at'),
  );

  final String id;
  final String invoiceNumber;
  final InvoiceKind kind;
  final String? bookingId;
  final String? orderId;
  final List<InvoiceLine> lineItems;
  final int subtotalMinor;
  final int taxMinor;
  final int totalMinor;
  final String currency;
  final DateTime? issuedAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'invoice_number': invoiceNumber,
    'kind': kind.json,
    'booking_id': bookingId,
    'order_id': orderId,
    'line_items': lineItems.map((l) => l.toJson()).toList(),
    'subtotal_minor': subtotalMinor,
    'tax_minor': taxMinor,
    'total_minor': totalMinor,
    'currency': currency,
    'issued_at': issuedAt?.toUtc().toIso8601String(),
  };
}
