import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../network/api_client.dart';

/// Visa, travel, accommodation, local services and SOS (PLAN §8.8). Patients create requests
/// (status `requested`); staff / hospitals move them forward.
class TravelRepository {
  TravelRepository(this._api);

  final ApiClient _api;

  // ------------------------------------------------------------------ visa

  /// `GET /travel/visa-requests`
  Future<List<VisaRequest>> visaRequests({String? caseId}) async =>
      parseList(await _api.get('/travel/visa-requests', query: {'case_id': caseId}), VisaRequest.fromJson);

  /// `POST /travel/visa-requests`
  Future<VisaRequest> createVisaRequest({
    required String caseId,
    VisaType visaType = VisaType.eMedical,
    String? notes,
  }) async => VisaRequest.fromJson(
    asJsonMap(
      await _api.post(
        '/travel/visa-requests',
        data: compactJson({'case_id': caseId, 'visa_type': visaType.json, 'notes': notes}),
      ),
    ),
  );

  // ---------------------------------------------------------------- travel

  /// `GET /travel/travel-bookings`
  Future<List<TravelBooking>> travelBookings({String? caseId}) async =>
      parseList(await _api.get('/travel/travel-bookings', query: {'case_id': caseId}), TravelBooking.fromJson);

  /// `POST /travel/travel-bookings` (flight / airport pickup / drop / local transport request).
  Future<TravelBooking> createTravelBooking({
    required String caseId,
    required TravelKind kind,
    String? fromLocation,
    String? toLocation,
    DateTime? departAt,
    DateTime? arriveAt,
    String? carrier,
    String? flightNumber,
    int passengers = 1,
    String? notes,
    Map<String, dynamic>? details,
  }) async => TravelBooking.fromJson(
    asJsonMap(
      await _api.post(
        '/travel/travel-bookings',
        data: compactJson({
          'case_id': caseId,
          'kind': kind.json,
          'from_location': fromLocation,
          'to_location': toLocation,
          'depart_at': departAt?.toUtc().toIso8601String(),
          'arrive_at': arriveAt?.toUtc().toIso8601String(),
          'carrier': carrier,
          'flight_number': flightNumber,
          'passengers': passengers,
          'notes': notes,
          'details': details,
        }, dropEmptyStrings: true),
      ),
    ),
  );

  /// `PATCH /travel/travel-bookings/{id}` (e.g. add flight details or cancel).
  Future<TravelBooking> updateTravelBooking(String id, Map<String, Object?> fields) async =>
      TravelBooking.fromJson(asJsonMap(await _api.patch('/travel/travel-bookings/$id', data: compactJson(fields))));

  // --------------------------------------------------------- accommodation

  /// `GET /travel/accommodation-bookings`
  Future<List<AccommodationBooking>> accommodationBookings({String? caseId}) async => parseList(
    await _api.get('/travel/accommodation-bookings', query: {'case_id': caseId}),
    AccommodationBooking.fromJson,
  );

  /// `POST /travel/accommodation-bookings`
  Future<AccommodationBooking> createAccommodationBooking({
    required String caseId,
    required String providerId,
    required DateTime checkIn,
    required DateTime checkOut,
    int guests = 1,
    String? roomType,
    String? notes,
  }) async => AccommodationBooking.fromJson(
    asJsonMap(
      await _api.post(
        '/travel/accommodation-bookings',
        data: compactJson({
          'case_id': caseId,
          'provider_id': providerId,
          'check_in': toApiDate(checkIn),
          'check_out': toApiDate(checkOut),
          'guests': guests,
          'room_type': roomType,
          'notes': notes,
        }, dropEmptyStrings: true),
      ),
    ),
  );

  /// `PATCH /travel/accommodation-bookings/{id}`
  Future<AccommodationBooking> updateAccommodationBooking(String id, Map<String, Object?> fields) async =>
      AccommodationBooking.fromJson(
        asJsonMap(await _api.patch('/travel/accommodation-bookings/$id', data: compactJson(fields))),
      );

  // -------------------------------------------------------------- services

  /// `GET /travel/service-bookings`
  Future<List<ServiceBooking>> serviceBookings({String? caseId}) async =>
      parseList(await _api.get('/travel/service-bookings', query: {'case_id': caseId}), ServiceBooking.fromJson);

  /// `POST /travel/service-bookings` (translator, local guide, transport...).
  Future<ServiceBooking> createServiceBooking({
    required String caseId,
    required ServiceKind kind,
    String? providerId,
    DateTime? startsAt,
    DateTime? endsAt,
    String? notes,
  }) async => ServiceBooking.fromJson(
    asJsonMap(
      await _api.post(
        '/travel/service-bookings',
        data: compactJson({
          'case_id': caseId,
          'kind': kind.json,
          'provider_id': providerId,
          'starts_at': startsAt?.toUtc().toIso8601String(),
          'ends_at': endsAt?.toUtc().toIso8601String(),
          'notes': notes,
        }, dropEmptyStrings: true),
      ),
    ),
  );

  /// `PATCH /travel/service-bookings/{id}`
  Future<ServiceBooking> updateServiceBooking(String id, Map<String, Object?> fields) async =>
      ServiceBooking.fromJson(asJsonMap(await _api.patch('/travel/service-bookings/$id', data: compactJson(fields))));

  // ------------------------------------------------------------------- SOS

  /// `POST /travel/sos {lat?, lng?, message?, case_id?}` — notifies coordinator + support staff.
  Future<SosAlert> sos({double? lat, double? lng, String? message, String? caseId}) async => SosAlert.fromJson(
    asJsonMap(
      await _api.post(
        '/travel/sos',
        data: compactJson({'lat': lat, 'lng': lng, 'message': message, 'case_id': caseId}, dropEmptyStrings: true),
      ),
    ),
  );
}

final travelRepositoryProvider = Provider<TravelRepository>((ref) => TravelRepository(ref.watch(apiClientProvider)));

/// Keyed by case id (null = all of mine).
final visaRequestsProvider = FutureProvider.autoDispose.family<List<VisaRequest>, String?>(
  (ref, caseId) => ref.watch(travelRepositoryProvider).visaRequests(caseId: caseId),
);

final travelBookingsProvider = FutureProvider.autoDispose.family<List<TravelBooking>, String?>(
  (ref, caseId) => ref.watch(travelRepositoryProvider).travelBookings(caseId: caseId),
);

final accommodationBookingsProvider = FutureProvider.autoDispose.family<List<AccommodationBooking>, String?>(
  (ref, caseId) => ref.watch(travelRepositoryProvider).accommodationBookings(caseId: caseId),
);

final serviceBookingsProvider = FutureProvider.autoDispose.family<List<ServiceBooking>, String?>(
  (ref, caseId) => ref.watch(travelRepositoryProvider).serviceBookings(caseId: caseId),
);
