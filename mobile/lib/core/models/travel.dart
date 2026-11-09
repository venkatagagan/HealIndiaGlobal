import 'enums.dart';
import 'json.dart';

String? _iso(DateTime? d) => d?.toUtc().toIso8601String();

/// The API nests the patient (`TravelPatientRef {id, full_name}`) and provider (`{id, name, ...}`).
JsonMap? _ref(String? id, String? name, [String nameKey = 'full_name']) =>
    id == null && name == null ? null : {'id': id, nameKey: name};

/// `/travel/visa-requests` item (PLAN §4.8).
class VisaRequest {
  const VisaRequest({
    required this.id,
    required this.caseId,
    required this.visaType,
    required this.status,
    this.patientId,
    this.patientName,
    this.caseNumber,
    this.invitationLetterDocumentId,
    this.applicationReference,
    this.appliedAt,
    this.decidedAt,
    this.notes,
    this.createdAt,
  });

  factory VisaRequest.fromJson(JsonMap j) => VisaRequest(
    id: jStr(j, 'id'),
    caseId: jStr(j, 'case_id'),
    patientId: jStrOrNull(jMap(j, 'patient'), 'id'),
    patientName: jStrOrNull(jMap(j, 'patient'), 'full_name'),
    caseNumber: jStrOrNull(j, 'case_number'),
    visaType: VisaType.fromJson(j['visa_type']),
    status: VisaStatus.fromJson(j['status']),
    invitationLetterDocumentId: jStrOrNull(j, 'invitation_letter_document_id'),
    applicationReference: jStrOrNull(j, 'application_reference'),
    appliedAt: jDate(j, 'applied_at'),
    decidedAt: jDate(j, 'decided_at'),
    notes: jStrOrNull(j, 'notes'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String caseId;
  final String? patientId;
  final String? patientName;
  final String? caseNumber;
  final VisaType visaType;
  final VisaStatus status;
  final String? invitationLetterDocumentId;
  final String? applicationReference;
  final DateTime? appliedAt;
  final DateTime? decidedAt;
  final String? notes;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'case_id': caseId,
    'case_number': caseNumber,
    'patient': _ref(patientId, patientName),
    'visa_type': visaType.json,
    'status': status.json,
    'invitation_letter_document_id': invitationLetterDocumentId,
    'application_reference': applicationReference,
    'applied_at': _iso(appliedAt),
    'decided_at': _iso(decidedAt),
    'notes': notes,
    'created_at': _iso(createdAt),
  };
}

/// `/travel/travel-bookings` item: flight, airport pickup/drop, local transport.
class TravelBooking {
  const TravelBooking({
    required this.id,
    required this.caseId,
    required this.kind,
    required this.status,
    this.patientId,
    this.patientName,
    this.caseNumber,
    this.fromLocation,
    this.toLocation,
    this.departAt,
    this.arriveAt,
    this.carrier,
    this.flightNumber,
    this.pnr,
    this.passengers = 1,
    this.priceMinor,
    this.currency = 'INR',
    this.details = const {},
    this.notes,
    this.createdAt,
  });

  factory TravelBooking.fromJson(JsonMap j) => TravelBooking(
    id: jStr(j, 'id'),
    caseId: jStr(j, 'case_id'),
    patientId: jStrOrNull(jMap(j, 'patient'), 'id'),
    patientName: jStrOrNull(jMap(j, 'patient'), 'full_name'),
    caseNumber: jStrOrNull(j, 'case_number'),
    kind: TravelKind.fromJson(j['kind']),
    status: ServiceBookingStatus.fromJson(j['status']),
    fromLocation: jStrOrNull(j, 'from_location'),
    toLocation: jStrOrNull(j, 'to_location'),
    departAt: jDate(j, 'depart_at'),
    arriveAt: jDate(j, 'arrive_at'),
    carrier: jStrOrNull(j, 'carrier'),
    flightNumber: jStrOrNull(j, 'flight_number'),
    pnr: jStrOrNull(j, 'pnr'),
    passengers: jInt(j, 'passengers', 1),
    priceMinor: jIntOrNull(j, 'price_minor'),
    currency: jStr(j, 'currency', 'INR'),
    details: jMap(j, 'details'),
    notes: jStrOrNull(j, 'notes'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String caseId;
  final String? patientId;
  final String? patientName;
  final String? caseNumber;
  final TravelKind kind;
  final ServiceBookingStatus status;
  final String? fromLocation;
  final String? toLocation;
  final DateTime? departAt;
  final DateTime? arriveAt;
  final String? carrier;
  final String? flightNumber;
  final String? pnr;
  final int passengers;
  final int? priceMinor;
  final String currency;
  final JsonMap details;
  final String? notes;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'case_id': caseId,
    'case_number': caseNumber,
    'patient': _ref(patientId, patientName),
    'kind': kind.json,
    'status': status.json,
    'from_location': fromLocation,
    'to_location': toLocation,
    'depart_at': _iso(departAt),
    'arrive_at': _iso(arriveAt),
    'carrier': carrier,
    'flight_number': flightNumber,
    'pnr': pnr,
    'passengers': passengers,
    'price_minor': priceMinor,
    'currency': currency,
    'details': details,
    'notes': notes,
    'created_at': _iso(createdAt),
  };
}

/// `/travel/accommodation-bookings` item.
class AccommodationBooking {
  const AccommodationBooking({
    required this.id,
    required this.caseId,
    required this.status,
    this.patientId,
    this.patientName,
    this.caseNumber,
    this.providerId,
    this.providerName,
    this.checkIn,
    this.checkOut,
    this.guests = 1,
    this.roomType,
    this.nightlyRateMinor,
    this.totalMinor,
    this.currency = 'INR',
    this.confirmationCode,
    this.notes,
    this.createdAt,
  });

  factory AccommodationBooking.fromJson(JsonMap j) => AccommodationBooking(
    id: jStr(j, 'id'),
    caseId: jStr(j, 'case_id'),
    patientId: jStrOrNull(jMap(j, 'patient'), 'id'),
    patientName: jStrOrNull(jMap(j, 'patient'), 'full_name'),
    caseNumber: jStrOrNull(j, 'case_number'),
    providerId: jStrOrNull(jMap(j, 'provider'), 'id'),
    providerName: jStrOrNull(jMap(j, 'provider'), 'name'),
    checkIn: jDay(j, 'check_in'),
    checkOut: jDay(j, 'check_out'),
    guests: jInt(j, 'guests', 1),
    roomType: jStrOrNull(j, 'room_type'),
    nightlyRateMinor: jIntOrNull(j, 'nightly_rate_minor'),
    totalMinor: jIntOrNull(j, 'total_minor'),
    currency: jStr(j, 'currency', 'INR'),
    status: ServiceBookingStatus.fromJson(j['status']),
    confirmationCode: jStrOrNull(j, 'confirmation_code'),
    notes: jStrOrNull(j, 'notes'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String caseId;
  final String? patientId;
  final String? patientName;
  final String? caseNumber;
  final String? providerId;
  final String? providerName;
  final DateTime? checkIn;
  final DateTime? checkOut;
  final int guests;
  final String? roomType;
  final int? nightlyRateMinor;
  final int? totalMinor;
  final String currency;
  final ServiceBookingStatus status;
  final String? confirmationCode;
  final String? notes;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'case_id': caseId,
    'case_number': caseNumber,
    'patient': _ref(patientId, patientName),
    'provider': _ref(providerId, providerName, 'name'),
    'check_in': checkIn == null ? null : toApiDate(checkIn!),
    'check_out': checkOut == null ? null : toApiDate(checkOut!),
    'guests': guests,
    'room_type': roomType,
    'nightly_rate_minor': nightlyRateMinor,
    'total_minor': totalMinor,
    'currency': currency,
    'status': status.json,
    'confirmation_code': confirmationCode,
    'notes': notes,
    'created_at': _iso(createdAt),
  };
}

/// `/travel/service-bookings` item: translator, local guide, transport...
class ServiceBooking {
  const ServiceBooking({
    required this.id,
    required this.caseId,
    required this.kind,
    required this.status,
    this.patientId,
    this.patientName,
    this.caseNumber,
    this.providerId,
    this.providerName,
    this.startsAt,
    this.endsAt,
    this.priceMinor,
    this.currency = 'INR',
    this.notes,
    this.createdAt,
  });

  factory ServiceBooking.fromJson(JsonMap j) => ServiceBooking(
    id: jStr(j, 'id'),
    caseId: jStr(j, 'case_id'),
    patientId: jStrOrNull(jMap(j, 'patient'), 'id'),
    patientName: jStrOrNull(jMap(j, 'patient'), 'full_name'),
    caseNumber: jStrOrNull(j, 'case_number'),
    providerId: jStrOrNull(jMap(j, 'provider'), 'id'),
    providerName: jStrOrNull(jMap(j, 'provider'), 'name'),
    kind: ServiceKind.fromJson(j['kind']),
    startsAt: jDate(j, 'starts_at'),
    endsAt: jDate(j, 'ends_at'),
    status: ServiceBookingStatus.fromJson(j['status']),
    priceMinor: jIntOrNull(j, 'price_minor'),
    currency: jStr(j, 'currency', 'INR'),
    notes: jStrOrNull(j, 'notes'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String caseId;
  final String? patientId;
  final String? patientName;
  final String? caseNumber;
  final String? providerId;
  final String? providerName;
  final ServiceKind kind;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final ServiceBookingStatus status;
  final int? priceMinor;
  final String currency;
  final String? notes;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'case_id': caseId,
    'case_number': caseNumber,
    'patient': _ref(patientId, patientName),
    'provider': _ref(providerId, providerName, 'name'),
    'kind': kind.json,
    'starts_at': _iso(startsAt),
    'ends_at': _iso(endsAt),
    'status': status.json,
    'price_minor': priceMinor,
    'currency': currency,
    'notes': notes,
    'created_at': _iso(createdAt),
  };
}

/// `POST /travel/sos` result.
class SosAlert {
  const SosAlert({
    required this.id,
    required this.status,
    this.patientId,
    this.patientName,
    this.caseId,
    this.caseNumber,
    this.lat,
    this.lng,
    this.message,
    this.createdAt,
  });

  factory SosAlert.fromJson(JsonMap j) => SosAlert(
    id: jStr(j, 'id'),
    patientId: jStrOrNull(jMap(j, 'patient'), 'id'),
    patientName: jStrOrNull(jMap(j, 'patient'), 'full_name'),
    caseId: jStrOrNull(j, 'case_id'),
    caseNumber: jStrOrNull(j, 'case_number'),
    lat: jDoubleOrNull(j, 'lat'),
    lng: jDoubleOrNull(j, 'lng'),
    message: jStrOrNull(j, 'message'),
    status: SosStatus.fromJson(j['status']),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String? patientId;
  final String? patientName;
  final String? caseId;
  final String? caseNumber;
  final double? lat;
  final double? lng;
  final String? message;
  final SosStatus status;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'patient': _ref(patientId, patientName),
    'case_id': caseId,
    'case_number': caseNumber,
    'lat': lat,
    'lng': lng,
    'message': message,
    'status': status.json,
    'created_at': _iso(createdAt),
  };
}
