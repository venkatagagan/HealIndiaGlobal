import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_controller.dart';
import '../models/models.dart';
import '../network/api_client.dart';

/// Verified reviews written by the patient after a completed booking.
class TrustRepository {
  TrustRepository(this._api);

  final ApiClient _api;

  /// `GET /me/reviews/eligible` — completed bookings without a review yet.
  Future<List<ReviewableBooking>> eligible() async =>
      parseList(await _api.get('/me/reviews/eligible'), ReviewableBooking.fromJson);

  /// `GET /me/reviews`
  Future<List<PatientReview>> myReviews() async => parseList(await _api.get('/me/reviews'), PatientReview.fromJson);

  /// `POST /reviews` (starts as `pending` until moderated).
  Future<PatientReview> create({
    required String hospitalId,
    required String bookingId,
    required int rating,
    String? doctorId,
    String? title,
    String? body,
  }) async => PatientReview.fromJson(
    asJsonMap(
      await _api.post(
        '/reviews',
        data: compactJson({
          'hospital_id': hospitalId,
          'booking_id': bookingId,
          'doctor_id': doctorId,
          'rating': rating,
          'title': title,
          'body': body,
        }, dropEmptyStrings: true),
      ),
    ),
  );

  /// `PATCH /me/reviews/{id}` (pending reviews only).
  Future<PatientReview> update(String id, {int? rating, String? title, String? body}) async => PatientReview.fromJson(
    asJsonMap(
      await _api.patch('/me/reviews/$id', data: compactJson({'rating': rating, 'title': title, 'body': body})),
    ),
  );

  /// `DELETE /me/reviews/{id}`
  Future<void> delete(String id) => _api.delete('/me/reviews/$id');
}

final trustRepositoryProvider = Provider<TrustRepository>((ref) => TrustRepository(ref.watch(apiClientProvider)));

/// Completed bookings the patient can still review (empty for guests and other roles).
final eligibleReviewsProvider = FutureProvider.autoDispose<List<ReviewableBooking>>((ref) async {
  final auth = ref.watch(authStateProvider);
  if (!auth.isAuthenticated || auth.user?.role != UserRole.patient) return const [];
  return ref.watch(trustRepositoryProvider).eligible();
});

final myReviewsProvider = FutureProvider.autoDispose<List<PatientReview>>(
  (ref) => ref.watch(trustRepositoryProvider).myReviews(),
);
