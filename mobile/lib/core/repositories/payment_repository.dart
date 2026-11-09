import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../network/api_client.dart';

/// Payments (PLAN §8.11). Amounts are always derived server-side; the client only names the
/// purpose and gateway.
class PaymentRepository {
  PaymentRepository(this._api);

  final ApiClient _api;

  /// Random idempotency key (128-bit hex). Generate one per checkout attempt and reuse it when
  /// retrying the same attempt.
  static String newIdempotencyKey() {
    final r = Random.secure();
    return List.generate(16, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }

  /// `POST /payments/orders` (header `Idempotency-Key`) -> [Checkout].
  Future<Checkout> createOrder({
    required PaymentPurpose purpose,
    required PaymentGateway gateway,
    String? bookingId,
    String? installmentId,
    String? consultationId,
    String? currency,
    String? idempotencyKey,
  }) async => Checkout.fromJson(
    asJsonMap(
      await _api.post(
        '/payments/orders',
        headers: {'Idempotency-Key': idempotencyKey ?? newIdempotencyKey()},
        data: compactJson({
          'booking_id': bookingId,
          'installment_id': installmentId,
          'consultation_id': consultationId,
          'purpose': purpose.json,
          'gateway': gateway.json,
          'currency': currency,
        }),
      ),
    ),
  );

  /// `GET /payments/orders?status=&booking_id=&page=`
  Future<Paged<PaymentOrder>> orders({OrderStatus? status, String? bookingId, int page = 1}) async => Paged.fromJson(
    await _api.get('/payments/orders', query: {'status': status?.json, 'booking_id': bookingId, 'page': page}),
    PaymentOrder.fromJson,
  );

  /// `GET /payments/orders/{id}`
  Future<PaymentOrder> order(String id) async =>
      PaymentOrder.fromJson(asJsonMap(await _api.get('/payments/orders/$id')));

  /// `POST /payments/orders/{id}/verify` with the Razorpay checkout success payload.
  Future<PaymentOrder> verifyRazorpay(
    String orderId, {
    required String razorpayPaymentId,
    required String razorpayOrderId,
    required String razorpaySignature,
  }) async => PaymentOrder.fromJson(
    asJsonMap(
      await _api.post(
        '/payments/orders/$orderId/verify',
        data: {
          'razorpay_payment_id': razorpayPaymentId,
          'razorpay_order_id': razorpayOrderId,
          'razorpay_signature': razorpaySignature,
        },
      ),
    ),
  );

  /// `POST /payments/orders/{id}/bank-transfer-proof {document_id, reference}`.
  /// Upload the proof first with `DocumentRepository.upload(kind: DocumentKind.paymentProof)`.
  Future<PaymentOrder?> submitBankTransferProof(
    String orderId, {
    required String documentId,
    required String reference,
  }) async {
    final data = await _api.post(
      '/payments/orders/$orderId/bank-transfer-proof',
      data: {'document_id': documentId, 'reference': reference},
    );
    return _orderOrNull(data);
  }

  /// `POST /payments/mock/{order_id}/complete {outcome}` — dev / test gateway only.
  Future<PaymentOrder?> completeMock(String orderId, {bool success = true}) async {
    final data = await _api.post(
      '/payments/mock/$orderId/complete',
      data: {'outcome': success ? 'success' : 'failure'},
    );
    return _orderOrNull(data);
  }

  /// `GET /payments/bookings/{booking_id}/installments`
  Future<List<Installment>> installments(String bookingId) async =>
      parseList(await _api.get('/payments/bookings/$bookingId/installments'), Installment.fromJson);

  /// `GET /payments/invoices`
  Future<List<Invoice>> invoices({String? bookingId}) async =>
      parseList(await _api.get('/payments/invoices', query: {'booking_id': bookingId}), Invoice.fromJson);

  /// `GET /payments/invoices/{id}`
  Future<Invoice> invoice(String id) async => Invoice.fromJson(asJsonMap(await _api.get('/payments/invoices/$id')));

  /// `GET /payments/invoices/{id}/pdf` (bytes).
  Future<Uint8List> invoicePdf(String id) => _api.getBytes('/payments/invoices/$id/pdf');

  static PaymentOrder? _orderOrNull(Object? data) {
    final m = asJsonMapOrNull(data);
    if (m == null) return null;
    if (m['order'] is Map) return PaymentOrder.fromJson(asJsonMap(m['order']));
    return m.containsKey('order_number') ? PaymentOrder.fromJson(m) : null;
  }
}

final paymentRepositoryProvider = Provider<PaymentRepository>((ref) => PaymentRepository(ref.watch(apiClientProvider)));

final paymentOrderProvider = FutureProvider.autoDispose.family<PaymentOrder, String>(
  (ref, id) => ref.watch(paymentRepositoryProvider).order(id),
);

/// Payment orders of a booking.
final bookingPaymentOrdersProvider = FutureProvider.autoDispose.family<List<PaymentOrder>, String>(
  (ref, bookingId) async => (await ref.watch(paymentRepositoryProvider).orders(bookingId: bookingId)).items,
);

final installmentsProvider = FutureProvider.autoDispose.family<List<Installment>, String>(
  (ref, bookingId) => ref.watch(paymentRepositoryProvider).installments(bookingId),
);

final invoicesProvider = FutureProvider.autoDispose<List<Invoice>>(
  (ref) => ref.watch(paymentRepositoryProvider).invoices(),
);
