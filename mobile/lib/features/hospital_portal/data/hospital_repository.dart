import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_client.dart';
import '../../agent_portal/shared/portal_api.dart';
import 'hospital_models.dart';

/// Hospital-portal endpoints (PLAN §8.5) and the hospital side of cases, quotes, bookings,
/// itineraries and visa requests (PLAN §8.7-8.8). Every call carries `X-Hospital-Id` when the
/// member picked a hospital; list calls are also filtered by `hospital_id`.
class HospitalPortalRepository {
  HospitalPortalRepository(this._api, {this.hospitalId, this.headers = const {}});

  final ApiClient _api;
  final String? hospitalId;
  final Map<String, String> headers;

  Future<dynamic> _get(String path, [Map<String, Object?>? query]) =>
      portalSend(_api, 'GET', path, query: query, headers: headers);

  Future<dynamic> _send(String method, String path, [Object? data]) =>
      portalSend(_api, method, path, data: data, headers: headers);

  /// `GET /hospital-portal/dashboard`
  Future<HospitalDashboard> dashboard() async =>
      HospitalDashboard.fromJson(asJsonMap(await _get('/hospital-portal/dashboard')));

  /// `GET /hospital-portal/profile` (listing status only).
  Future<HospitalListing> listing() async =>
      HospitalListing.fromJson(asJsonMap(await _get('/hospital-portal/profile')));

  /// `GET /cases?hospital_id=&status=&q=`
  Future<Paged<MedicalCase>> cases({CaseStatus? status, String? q, int pageSize = 50}) async => Paged.fromJson(
    await _get('/cases', {'hospital_id': hospitalId, 'status': status?.json, 'q': q, 'page': 1, 'page_size': pageSize}),
    MedicalCase.fromJson,
  );

  /// `GET /cases/{id}`
  Future<MedicalCaseDetail> caseDetail(String id) async =>
      MedicalCaseDetail.fromJson(asJsonMap(await _get('/cases/$id')));

  /// `POST /cases/{id}/quotes` -> quote `sent`, case `quoted`.
  Future<Quote> submitQuote(String caseId, QuoteDraft draft) async =>
      Quote.fromJson(asJsonMap(await _send('POST', '/cases/$caseId/quotes', draft.toJson())));

  /// `POST /cases/{id}/status {to_status: declined, note}`
  Future<void> declineCase(String caseId, {String? note}) => _send(
    'POST',
    '/cases/$caseId/status',
    compactJson({'to_status': CaseStatus.declined.json, 'note': note}, dropEmptyStrings: true),
  );

  /// `GET /bookings?hospital_id=&status=`
  Future<Paged<Booking>> bookings({BookingStatus? status, int pageSize = 50}) async => Paged.fromJson(
    await _get('/bookings', {'hospital_id': hospitalId, 'status': status?.json, 'page': 1, 'page_size': pageSize}),
    Booking.fromJson,
  );

  /// `GET /bookings/{id}`
  Future<Booking> booking(String id) async => Booking.fromJson(asJsonMap(await _get('/bookings/$id')));

  /// `POST /bookings/{id}/admit {note?}`
  Future<Booking> admit(String id, {String? note}) async => Booking.fromJson(
    asJsonMap(await _send('POST', '/bookings/$id/admit', compactJson({'note': note}, dropEmptyStrings: true))),
  );

  /// `POST /bookings/{id}/complete {note?, discharge_date?}` (discharge).
  Future<Booking> discharge(String id, {String? note, DateTime? dischargeDate}) async => Booking.fromJson(
    asJsonMap(
      await _send(
        'POST',
        '/bookings/$id/complete',
        compactJson({
          'note': note,
          'discharge_date': dischargeDate == null ? null : toApiDate(dischargeDate),
        }, dropEmptyStrings: true),
      ),
    ),
  );

  /// `GET /bookings/{id}/itinerary`
  Future<List<ItineraryItem>> itinerary(String bookingId) async =>
      parseList(await _get('/bookings/$bookingId/itinerary'), ItineraryItem.fromJson);

  /// `POST /bookings/{id}/itinerary`
  Future<ItineraryItem> addItinerary(String bookingId, ItineraryDraft draft) async =>
      ItineraryItem.fromJson(asJsonMap(await _send('POST', '/bookings/$bookingId/itinerary', draft.toJson())));

  /// `PATCH /bookings/{id}/itinerary/{item_id} {status}`
  Future<ItineraryItem> setItineraryStatus(String bookingId, String itemId, ItineraryItemStatus status) async =>
      ItineraryItem.fromJson(
        asJsonMap(await _send('PATCH', '/bookings/$bookingId/itinerary/$itemId', {'status': status.json})),
      );

  /// `DELETE /bookings/{id}/itinerary/{item_id}`
  Future<void> deleteItinerary(String bookingId, String itemId) =>
      _send('DELETE', '/bookings/$bookingId/itinerary/$itemId');

  /// `GET /travel/visa-requests?status=`
  Future<List<HospitalVisaRequest>> visaRequests({VisaStatus? status}) async => parseList(
    await _get('/travel/visa-requests', {'status': status?.json, 'page_size': 100}),
    HospitalVisaRequest.fromJson,
  );

  /// `PATCH /travel/visa-requests/{id}` (status, invitation letter, reference, notes).
  Future<HospitalVisaRequest> updateVisa(
    String id, {
    VisaStatus? status,
    String? invitationLetterDocumentId,
    String? applicationReference,
    String? notes,
  }) async => HospitalVisaRequest.fromJson(
    asJsonMap(
      await _send(
        'PATCH',
        '/travel/visa-requests/$id',
        compactJson({
          'status': status?.json,
          'invitation_letter_document_id': invitationLetterDocumentId,
          'application_reference': applicationReference,
          'notes': notes,
        }, dropEmptyStrings: true),
      ),
    ),
  );

  /// `GET /hospital-portal/doctors`
  Future<List<DoctorDetail>> doctors() async =>
      parseList(await _get('/hospital-portal/doctors'), DoctorDetail.fromJson);

  /// `GET /hospital-portal/procedures` (price list with packages).
  Future<List<HospitalProcedure>> procedures() async =>
      parseList(await _get('/hospital-portal/procedures'), HospitalProcedure.fromJson);
}

final hospitalRepositoryProvider = Provider<HospitalPortalRepository>(
  (ref) => HospitalPortalRepository(
    ref.watch(apiClientProvider),
    hospitalId: ref.watch(activeHospitalProvider)?.id,
    headers: ref.watch(portalHeadersProvider),
  ),
);

final hospitalDashboardProvider = FutureProvider.autoDispose<HospitalDashboard>(
  (ref) => ref.watch(hospitalRepositoryProvider).dashboard(),
);

final hospitalListingProvider = FutureProvider.autoDispose<HospitalListing>(
  (ref) => ref.watch(hospitalRepositoryProvider).listing(),
);

/// Cases of the hospital by status (null = all).
final hospitalCasesProvider = FutureProvider.autoDispose.family<Paged<MedicalCase>, CaseStatus?>(
  (ref, status) => ref.watch(hospitalRepositoryProvider).cases(status: status),
);

final hospitalCaseDetailProvider = FutureProvider.autoDispose.family<MedicalCaseDetail, String>(
  (ref, id) => ref.watch(hospitalRepositoryProvider).caseDetail(id),
);

/// Bookings of the hospital by status (null = all).
final hospitalBookingsProvider = FutureProvider.autoDispose.family<Paged<Booking>, BookingStatus?>(
  (ref, status) => ref.watch(hospitalRepositoryProvider).bookings(status: status),
);

final hospitalBookingProvider = FutureProvider.autoDispose.family<Booking, String>(
  (ref, id) => ref.watch(hospitalRepositoryProvider).booking(id),
);

final hospitalItineraryProvider = FutureProvider.autoDispose.family<List<ItineraryItem>, String>(
  (ref, bookingId) => ref.watch(hospitalRepositoryProvider).itinerary(bookingId),
);

final hospitalVisasProvider = FutureProvider.autoDispose.family<List<HospitalVisaRequest>, VisaStatus?>(
  (ref, status) => ref.watch(hospitalRepositoryProvider).visaRequests(status: status),
);

final hospitalDoctorsProvider = FutureProvider.autoDispose<List<DoctorDetail>>(
  (ref) => ref.watch(hospitalRepositoryProvider).doctors(),
);

final hospitalProceduresProvider = FutureProvider.autoDispose<List<HospitalProcedure>>(
  (ref) => ref.watch(hospitalRepositoryProvider).procedures(),
);
