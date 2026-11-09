import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../network/api_client.dart';

/// Bookings, pre-arrival checklist and itinerary (PLAN §8.7).
class BookingRepository {
  BookingRepository(this._api);

  final ApiClient _api;

  /// `POST /bookings` -> `pending_payment`. Price comes from the quote or package server-side.
  Future<Booking> create({
    required String caseId,
    required DateTime admissionDate,
    required PaymentOption paymentOption,
    String? quoteId,
    String? packageId,
    int? installmentMonths,
    bool insuranceClaimRequested = false,
  }) async => Booking.fromJson(
    asJsonMap(
      await _api.post(
        '/bookings',
        data: compactJson({
          'case_id': caseId,
          'quote_id': quoteId,
          'package_id': packageId,
          'admission_date': toApiDate(admissionDate),
          'payment_option': paymentOption.json,
          'installment_months': paymentOption == PaymentOption.installments ? installmentMonths : null,
          'insurance_claim_requested': insuranceClaimRequested,
        }),
      ),
    ),
  );

  /// `GET /bookings?status=&page=`
  Future<Paged<Booking>> list({BookingStatus? status, int page = 1, int pageSize = 20}) async => Paged.fromJson(
    await _api.get('/bookings', query: {'status': status?.json, 'page': page, 'page_size': pageSize}),
    Booking.fromJson,
  );

  /// `GET /bookings/{id}`
  Future<Booking> get(String id) async => Booking.fromJson(asJsonMap(await _api.get('/bookings/$id')));

  /// `POST /bookings/{id}/cancel {reason}` — refund computed by the server's refund policy.
  Future<Booking> cancel(String id, {required String reason}) async =>
      Booking.fromJson(asJsonMap(await _api.post('/bookings/$id/cancel', data: {'reason': reason})));

  /// `GET /bookings/{id}/checklist`
  Future<List<ChecklistItem>> checklist(String bookingId) async =>
      parseList(await _api.get('/bookings/$bookingId/checklist'), ChecklistItem.fromJson);

  /// `PATCH /bookings/{id}/checklist/{item_id} {status}`
  Future<ChecklistItem> updateChecklistItem(String bookingId, String itemId, ChecklistStatus status) async =>
      ChecklistItem.fromJson(
        asJsonMap(await _api.patch('/bookings/$bookingId/checklist/$itemId', data: {'status': status.json})),
      );

  /// `GET /bookings/{id}/itinerary`
  Future<List<ItineraryItem>> itinerary(String bookingId) async =>
      parseList(await _api.get('/bookings/$bookingId/itinerary'), ItineraryItem.fromJson);
}

final bookingRepositoryProvider = Provider<BookingRepository>((ref) => BookingRepository(ref.watch(apiClientProvider)));

final bookingsProvider = FutureProvider.autoDispose.family<Paged<Booking>, BookingStatus?>(
  (ref, status) => ref.watch(bookingRepositoryProvider).list(status: status),
);

final bookingProvider = FutureProvider.autoDispose.family<Booking, String>(
  (ref, id) => ref.watch(bookingRepositoryProvider).get(id),
);

final checklistProvider = FutureProvider.autoDispose.family<List<ChecklistItem>, String>(
  (ref, bookingId) => ref.watch(bookingRepositoryProvider).checklist(bookingId),
);

final itineraryProvider = FutureProvider.autoDispose.family<List<ItineraryItem>, String>(
  (ref, bookingId) => ref.watch(bookingRepositoryProvider).itinerary(bookingId),
);
