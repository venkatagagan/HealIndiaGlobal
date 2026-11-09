import 'booking.dart';
import 'checklist.dart';
import 'doctor.dart';
import 'enums.dart';
import 'hospital.dart';
import 'itinerary.dart';
import 'json.dart';
import 'procedure.dart';
import 'screening.dart';

/// `emergency_contact{name, relationship, phone}`.
class EmergencyContact {
  const EmergencyContact({this.name, this.relationship, this.phone});

  factory EmergencyContact.fromJson(JsonMap j) => EmergencyContact(
    name: jStrOrNull(j, 'name'),
    relationship: jStrOrNull(j, 'relationship'),
    phone: jStrOrNull(j, 'phone'),
  );

  final String? name;
  final String? relationship;
  final String? phone;

  bool get isEmpty => (name ?? '').isEmpty && (phone ?? '').isEmpty;

  Map<String, dynamic> toJson() => {'name': name, 'relationship': relationship, 'phone': phone};
}

/// `PatientProfileOut` (PLAN §4.2 / §8.2). Passport numbers are never returned; only [passportLast4].
class PatientProfile {
  const PatientProfile({
    required this.id,
    this.userId,
    this.firstName,
    this.lastName,
    this.dateOfBirth,
    this.gender,
    this.nationality,
    this.countryOfResidence,
    this.passportLast4,
    this.passportExpiry,
    this.phone,
    this.whatsapp,
    this.address = const {},
    this.emergencyContact,
    this.preferredLanguage,
    this.bloodGroup,
    this.allergies,
    this.medicalHistory,
    this.insuranceProvider,
    this.insurancePolicyLast4,
    this.preferredCurrency = 'USD',
    this.email,
  });

  factory PatientProfile.fromJson(JsonMap j) => PatientProfile(
    id: jStr(j, 'id'),
    userId: jStrOrNull(j, 'user_id'),
    firstName: jStrOrNull(j, 'first_name'),
    lastName: jStrOrNull(j, 'last_name'),
    dateOfBirth: jDay(j, 'date_of_birth'),
    gender: Gender.fromJsonOrNull(j['gender']),
    nationality: jStrOrNull(j, 'nationality'),
    countryOfResidence: jStrOrNull(j, 'country_of_residence'),
    passportLast4: jStrOrNull(j, 'passport_last4'),
    passportExpiry: jDay(j, 'passport_expiry'),
    phone: jStrOrNull(j, 'phone'),
    whatsapp: jStrOrNull(j, 'whatsapp'),
    address: jMap(j, 'address'),
    emergencyContact: jObj(j, 'emergency_contact', EmergencyContact.fromJson),
    preferredLanguage: jStrOrNull(j, 'preferred_language'),
    bloodGroup: jStrOrNull(j, 'blood_group'),
    allergies: jStrOrNull(j, 'allergies'),
    medicalHistory: jStrOrNull(j, 'medical_history'),
    insuranceProvider: jStrOrNull(j, 'insurance_provider'),
    insurancePolicyLast4: jStrOrNull(j, 'insurance_policy_last4'),
    preferredCurrency: jStr(j, 'preferred_currency', 'USD'),
    email: jStrOrNull(j, 'email'),
  );

  final String id;
  final String? userId;
  final String? firstName;
  final String? lastName;
  final DateTime? dateOfBirth;
  final Gender? gender;

  /// ISO-3166 alpha-2.
  final String? nationality;
  final String? countryOfResidence;
  final String? passportLast4;
  final DateTime? passportExpiry;
  final String? phone;
  final String? whatsapp;
  final JsonMap address;
  final EmergencyContact? emergencyContact;
  final String? preferredLanguage;
  final String? bloodGroup;
  final String? allergies;
  final String? medicalHistory;
  final String? insuranceProvider;
  final String? insurancePolicyLast4;
  final String preferredCurrency;
  final String? email;

  String get fullName => [firstName, lastName].whereType<String>().where((s) => s.isNotEmpty).join(' ');

  /// `•••• 1234`
  String? get maskedPassport => passportLast4 == null ? null : '•••• $passportLast4';

  Map<String, dynamic> toJson() => {
    'id': id,
    'user_id': userId,
    'first_name': firstName,
    'last_name': lastName,
    'date_of_birth': dateOfBirth == null ? null : toApiDate(dateOfBirth!),
    'gender': gender?.json,
    'nationality': nationality,
    'country_of_residence': countryOfResidence,
    'passport_last4': passportLast4,
    'passport_expiry': passportExpiry == null ? null : toApiDate(passportExpiry!),
    'phone': phone,
    'whatsapp': whatsapp,
    'address': address,
    'emergency_contact': emergencyContact?.toJson(),
    'preferred_language': preferredLanguage,
    'blood_group': bloodGroup,
    'allergies': allergies,
    'medical_history': medicalHistory,
    'insurance_provider': insuranceProvider,
    'insurance_policy_last4': insurancePolicyLast4,
    'preferred_currency': preferredCurrency,
    'email': email,
  };
}

/// Body of `PUT /patient/profile`. Null fields are omitted; [passportNumber] and
/// [insurancePolicyNumber] are write-only.
class PatientProfileUpdate {
  const PatientProfileUpdate({
    this.firstName,
    this.lastName,
    this.dateOfBirth,
    this.gender,
    this.nationality,
    this.countryOfResidence,
    this.passportNumber,
    this.passportExpiry,
    this.phone,
    this.whatsapp,
    this.address,
    this.emergencyContact,
    this.preferredLanguage,
    this.bloodGroup,
    this.allergies,
    this.medicalHistory,
    this.insuranceProvider,
    this.insurancePolicyNumber,
    this.preferredCurrency,
  });

  final String? firstName;
  final String? lastName;
  final DateTime? dateOfBirth;
  final Gender? gender;
  final String? nationality;
  final String? countryOfResidence;
  final String? passportNumber;
  final DateTime? passportExpiry;
  final String? phone;
  final String? whatsapp;
  final JsonMap? address;
  final EmergencyContact? emergencyContact;
  final String? preferredLanguage;
  final String? bloodGroup;
  final String? allergies;
  final String? medicalHistory;
  final String? insuranceProvider;
  final String? insurancePolicyNumber;
  final String? preferredCurrency;

  Map<String, dynamic> toJson() => compactJson({
    'first_name': firstName,
    'last_name': lastName,
    'date_of_birth': dateOfBirth == null ? null : toApiDate(dateOfBirth!),
    'gender': gender?.json,
    'nationality': nationality,
    'country_of_residence': countryOfResidence,
    'passport_number': passportNumber,
    'passport_expiry': passportExpiry == null ? null : toApiDate(passportExpiry!),
    'phone': phone,
    'whatsapp': whatsapp,
    'address': address,
    'emergency_contact': emergencyContact?.toJson(),
    'preferred_language': preferredLanguage,
    'blood_group': bloodGroup,
    'allergies': allergies,
    'medical_history': medicalHistory,
    'insurance_provider': insuranceProvider,
    'insurance_policy_number': insurancePolicyNumber,
    'preferred_currency': preferredCurrency,
  });
}

/// `/patient/companions` item (travel companion / attendant).
class PatientCompanion {
  const PatientCompanion({
    required this.id,
    required this.fullName,
    this.relationship,
    this.nationality,
    this.dateOfBirth,
    this.passportLast4,
  });

  factory PatientCompanion.fromJson(JsonMap j) => PatientCompanion(
    id: jStr(j, 'id'),
    fullName: jStr(j, 'full_name'),
    relationship: jStrOrNull(j, 'relationship'),
    nationality: jStrOrNull(j, 'nationality'),
    dateOfBirth: jDay(j, 'date_of_birth'),
    passportLast4: jStrOrNull(j, 'passport_last4'),
  );

  final String id;
  final String fullName;
  final String? relationship;
  final String? nationality;
  final DateTime? dateOfBirth;
  final String? passportLast4;

  Map<String, dynamic> toJson() => {
    'id': id,
    'full_name': fullName,
    'relationship': relationship,
    'nationality': nationality,
    'date_of_birth': dateOfBirth == null ? null : toApiDate(dateOfBirth!),
    'passport_last4': passportLast4,
  };
}

/// Body for creating / updating a companion (`passport_number` write-only).
class CompanionInput {
  const CompanionInput({
    required this.fullName,
    this.relationship,
    this.nationality,
    this.dateOfBirth,
    this.passportNumber,
  });

  final String fullName;
  final String? relationship;
  final String? nationality;
  final DateTime? dateOfBirth;
  final String? passportNumber;

  Map<String, dynamic> toJson() => compactJson({
    'full_name': fullName,
    'relationship': relationship,
    'nationality': nationality,
    'date_of_birth': dateOfBirth == null ? null : toApiDate(dateOfBirth!),
    'passport_number': passportNumber,
  });
}

/// `coordinator{id, full_name, phone}` on the dashboard.
class Coordinator {
  const Coordinator({required this.id, required this.fullName, this.phone});

  factory Coordinator.fromJson(JsonMap j) =>
      Coordinator(id: jStr(j, 'id'), fullName: jStr(j, 'full_name'), phone: jStrOrNull(j, 'phone'));

  final String id;
  final String fullName;
  final String? phone;

  Map<String, dynamic> toJson() => {'id': id, 'full_name': fullName, 'phone': phone};
}

/// `GET /patient/dashboard` (PLAN §8.2) — drives the Trips (pre-arrival) tab.
class PatientDashboard {
  const PatientDashboard({
    this.nextBooking,
    this.daysUntilTreatment,
    this.checklist = const [],
    this.todaySchedule = const [],
    this.activeCases = 0,
    this.unreadNotifications = 0,
    this.coordinator,
    this.recentScreenings = const [],
  });

  factory PatientDashboard.fromJson(JsonMap j) => PatientDashboard(
    nextBooking: jObj(j, 'next_booking', Booking.fromJson),
    daysUntilTreatment: jIntOrNull(j, 'days_until_treatment'),
    checklist: jList(j, 'checklist', ChecklistItem.fromJson),
    todaySchedule: jList(j, 'today_schedule', ItineraryItem.fromJson),
    activeCases: jInt(j, 'active_cases'),
    unreadNotifications: jInt(j, 'unread_notifications'),
    coordinator: jObj(j, 'coordinator', Coordinator.fromJson),
    recentScreenings: jList(j, 'recent_screenings', ScreeningSummary.fromJson),
  );

  final Booking? nextBooking;
  final int? daysUntilTreatment;
  final List<ChecklistItem> checklist;
  final List<ItineraryItem> todaySchedule;
  final int activeCases;
  final int unreadNotifications;
  final Coordinator? coordinator;
  final List<ScreeningSummary> recentScreenings;

  Map<String, dynamic> toJson() => {
    'next_booking': nextBooking?.toJson(),
    'days_until_treatment': daysUntilTreatment,
    'checklist': checklist.map((c) => c.toJson()).toList(),
    'today_schedule': todaySchedule.map((i) => i.toJson()).toList(),
    'active_cases': activeCases,
    'unread_notifications': unreadNotifications,
    'coordinator': coordinator?.toJson(),
    'recent_screenings': recentScreenings.map((s) => s.toJson()).toList(),
  };
}

/// `/patient/saved` item with embedded card. The card is read from `hospital` / `doctor` /
/// `procedure` (or a generic `card`) depending on [entityType].
class SavedItem {
  const SavedItem({
    required this.entityType,
    required this.entityId,
    this.id,
    this.createdAt,
    this.hospital,
    this.doctor,
    this.procedure,
  });

  factory SavedItem.fromJson(JsonMap j) {
    final type = SavedEntityType.fromJson(j['entity_type']);
    // SavedItemOut nests exactly one of hospital / doctor / procedure, matching entity_type.
    final h = asJsonMapOrNull(j['hospital']);
    final d = asJsonMapOrNull(j['doctor']);
    final p = asJsonMapOrNull(j['procedure']);
    return SavedItem(
      id: jStrOrNull(j, 'id'),
      entityType: type,
      entityId: jStr(j, 'entity_id'),
      createdAt: jDate(j, 'created_at'),
      hospital: h == null ? null : HospitalCard.fromJson(h),
      doctor: d == null ? null : DoctorCard.fromJson(d),
      procedure: p == null ? null : Procedure.fromJson(p),
    );
  }

  final String? id;
  final SavedEntityType entityType;
  final String entityId;
  final DateTime? createdAt;
  final HospitalCard? hospital;
  final DoctorCard? doctor;
  final Procedure? procedure;

  String get title => hospital?.name ?? doctor?.fullName ?? procedure?.name ?? entityType.label;

  Map<String, dynamic> toJson() => {
    'id': id,
    'entity_type': entityType.json,
    'entity_id': entityId,
    'created_at': createdAt?.toUtc().toIso8601String(),
    'hospital': hospital?.toJson(),
    'doctor': doctor?.toJson(),
    'procedure': procedure?.toJson(),
  };
}
