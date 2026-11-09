// GENERATED from docs/PLAN.md §5 (and fixed value sets of §4). Values are the exact wire values.

/// Implemented by every enum that maps to an API string value.
mixin JsonEnum on Enum {
  /// The exact snake_case value used by the API.
  String get json;

  /// Human readable label for UI.
  String get label => humanizeEnumValue(json);
}

/// `pending_payment` -> `Pending payment`.
String humanizeEnumValue(String v) {
  if (v.isEmpty) return v;
  final s = v.replaceAll('_', ' ');
  return s[0].toUpperCase() + s.substring(1);
}

/// Maps a wire value to an enum constant, using [fallback] for null / unknown values.
T enumFromJson<T extends JsonEnum>(List<T> values, Object? raw, T fallback) =>
    enumFromJsonOrNull(values, raw) ?? fallback;

/// Maps a wire value to an enum constant, or null for null / unknown values.
T? enumFromJsonOrNull<T extends JsonEnum>(List<T> values, Object? raw) {
  if (raw == null) return null;
  final s = raw.toString();
  for (final v in values) {
    if (v.json == s) return v;
  }
  return null;
}

/// Maps a JSON array of wire values, skipping unknown entries.
List<T> enumListFromJson<T extends JsonEnum>(List<T> values, Object? raw) {
  if (raw is! List) return <T>[];
  return raw.map((e) => enumFromJsonOrNull(values, e)).whereType<T>().toList(growable: false);
}

/// `UserRole` (PLAN §5).
enum UserRole with JsonEnum {
  patient('patient'),
  agent('agent'),
  hospital('hospital'),
  admin('admin'),
  finance('finance'),
  support('support'),
  superAdmin('super_admin');

  const UserRole(this.json);

  @override
  final String json;

  static UserRole fromJson(Object? raw) => enumFromJson(values, raw, UserRole.patient);

  static UserRole? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `UserStatus` (PLAN §5).
enum UserStatus with JsonEnum {
  active('active'),
  pendingVerification('pending_verification'),
  suspended('suspended'),
  deleted('deleted');

  const UserStatus(this.json);

  @override
  final String json;

  static UserStatus fromJson(Object? raw) => enumFromJson(values, raw, UserStatus.active);

  static UserStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `Gender` (PLAN §5).
enum Gender with JsonEnum {
  male('male'),
  female('female'),
  other('other'),
  undisclosed('undisclosed');

  const Gender(this.json);

  @override
  final String json;

  static Gender fromJson(Object? raw) => enumFromJson(values, raw, Gender.undisclosed);

  static Gender? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `DoctorGenderPref` (PLAN §5).
enum DoctorGenderPref with JsonEnum {
  male('male'),
  female('female'),
  noPreference('no_preference');

  const DoctorGenderPref(this.json);

  @override
  final String json;

  @override
  String get label => switch (this) {
    DoctorGenderPref.noPreference => 'No Preference',
    _ => humanizeEnumValue(json),
  };

  static DoctorGenderPref fromJson(Object? raw) => enumFromJson(values, raw, DoctorGenderPref.noPreference);

  static DoctorGenderPref? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `KycStatus` (PLAN §5).
enum KycStatus with JsonEnum {
  notSubmitted('not_submitted'),
  pending('pending'),
  approved('approved'),
  rejected('rejected');

  const KycStatus(this.json);

  @override
  final String json;

  static KycStatus fromJson(Object? raw) => enumFromJson(values, raw, KycStatus.notSubmitted);

  static KycStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `HospitalStatus` (PLAN §5).
enum HospitalStatus with JsonEnum {
  draft('draft'),
  pendingReview('pending_review'),
  active('active'),
  suspended('suspended'),
  rejected('rejected');

  const HospitalStatus(this.json);

  @override
  final String json;

  static HospitalStatus fromJson(Object? raw) => enumFromJson(values, raw, HospitalStatus.draft);

  static HospitalStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `AgentStatus` (PLAN §5).
enum AgentStatus with JsonEnum {
  pending('pending'),
  active('active'),
  suspended('suspended'),
  rejected('rejected');

  const AgentStatus(this.json);

  @override
  final String json;

  static AgentStatus fromJson(Object? raw) => enumFromJson(values, raw, AgentStatus.pending);

  static AgentStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `HospitalMemberRole` (PLAN §5).
enum HospitalMemberRole with JsonEnum {
  owner('owner'),
  admin('admin'),
  coordinator('coordinator'),
  finance('finance'),
  doctor('doctor');

  const HospitalMemberRole(this.json);

  @override
  final String json;

  static HospitalMemberRole fromJson(Object? raw) => enumFromJson(values, raw, HospitalMemberRole.owner);

  static HospitalMemberRole? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `PackageTier` (PLAN §5).
enum PackageTier with JsonEnum {
  medicalOnly('medical_only'),
  medicalStay('medical_stay'),
  allInclusive('all_inclusive');

  const PackageTier(this.json);

  @override
  final String json;

  @override
  String get label => switch (this) {
    PackageTier.medicalOnly => 'Medical Only',
    PackageTier.medicalStay => 'Medical + Stay',
    PackageTier.allInclusive => 'All-inclusive',
  };

  static PackageTier fromJson(Object? raw) => enumFromJson(values, raw, PackageTier.medicalOnly);

  static PackageTier? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `ScreeningStatus` (PLAN §5).
enum ScreeningStatus with JsonEnum {
  draft('draft'),
  processing('processing'),
  completed('completed'),
  failed('failed');

  const ScreeningStatus(this.json);

  @override
  final String json;

  static ScreeningStatus fromJson(Object? raw) => enumFromJson(values, raw, ScreeningStatus.draft);

  static ScreeningStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `Urgency` (PLAN §5).
enum Urgency with JsonEnum {
  routine('routine'),
  soon('soon'),
  urgent('urgent'),
  emergency('emergency');

  const Urgency(this.json);

  @override
  final String json;

  static Urgency fromJson(Object? raw) => enumFromJson(values, raw, Urgency.routine);

  static Urgency? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `DurationUnit` (PLAN §5).
enum DurationUnit with JsonEnum {
  days('days'),
  weeks('weeks'),
  months('months'),
  years('years');

  const DurationUnit(this.json);

  @override
  final String json;

  static DurationUnit fromJson(Object? raw) => enumFromJson(values, raw, DurationUnit.days);

  static DurationUnit? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// Daily-impact severity for work / sleep / mobility, screening step 3 (PLAN §5).
enum SeverityLevel with JsonEnum {
  none('none'),
  mild('mild'),
  moderate('moderate'),
  severe('severe');

  const SeverityLevel(this.json);

  @override
  final String json;

  static SeverityLevel fromJson(Object? raw) => enumFromJson(values, raw, SeverityLevel.none);

  static SeverityLevel? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// Swipe-card answers in screening step 2 (PLAN §5).
enum SymptomAnswer with JsonEnum {
  yes('yes'),
  maybe('maybe'),
  no('no');

  const SymptomAnswer(this.json);

  @override
  final String json;

  static SymptomAnswer fromJson(Object? raw) => enumFromJson(values, raw, SymptomAnswer.maybe);

  static SymptomAnswer? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `CaseStatus` (PLAN §5).
enum CaseStatus with JsonEnum {
  enquiry('enquiry'),
  quoted('quoted'),
  accepted('accepted'),
  booked('booked'),
  inTreatment('in_treatment'),
  completed('completed'),
  cancelled('cancelled'),
  declined('declined');

  const CaseStatus(this.json);

  @override
  final String json;

  static CaseStatus fromJson(Object? raw) => enumFromJson(values, raw, CaseStatus.enquiry);

  static CaseStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `QuoteStatus` (PLAN §5).
enum QuoteStatus with JsonEnum {
  draft('draft'),
  sent('sent'),
  accepted('accepted'),
  rejected('rejected'),
  expired('expired'),
  withdrawn('withdrawn');

  const QuoteStatus(this.json);

  @override
  final String json;

  static QuoteStatus fromJson(Object? raw) => enumFromJson(values, raw, QuoteStatus.draft);

  static QuoteStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `QuoteLineCategory` (PLAN §5).
enum QuoteLineCategory with JsonEnum {
  surgery('surgery'),
  hospitalStay('hospital_stay'),
  medications('medications'),
  testsScans('tests_scans'),
  doctorFees('doctor_fees'),
  implants('implants'),
  other('other');

  const QuoteLineCategory(this.json);

  @override
  final String json;

  @override
  String get label => switch (this) {
    QuoteLineCategory.hospitalStay => 'Hospital Stay',
    QuoteLineCategory.testsScans => 'Tests & Scans',
    QuoteLineCategory.doctorFees => 'Doctor Fees',
    _ => humanizeEnumValue(json),
  };

  static QuoteLineCategory fromJson(Object? raw) => enumFromJson(values, raw, QuoteLineCategory.other);

  static QuoteLineCategory? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `BookingStatus` (PLAN §5).
enum BookingStatus with JsonEnum {
  pendingPayment('pending_payment'),
  confirmed('confirmed'),
  admitted('admitted'),
  completed('completed'),
  cancelled('cancelled');

  const BookingStatus(this.json);

  @override
  final String json;

  static BookingStatus fromJson(Object? raw) => enumFromJson(values, raw, BookingStatus.pendingPayment);

  static BookingStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `PaymentOption` (PLAN §5).
enum PaymentOption with JsonEnum {
  full('full'),
  deposit('deposit'),
  installments('installments');

  const PaymentOption(this.json);

  @override
  final String json;

  @override
  String get label => switch (this) {
    PaymentOption.full => 'Pay in full',
    PaymentOption.deposit => 'Deposit',
    PaymentOption.installments => 'Payment plan',
  };

  static PaymentOption fromJson(Object? raw) => enumFromJson(values, raw, PaymentOption.full);

  static PaymentOption? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `ConsultationStatus` (PLAN §5).
enum ConsultationStatus with JsonEnum {
  requested('requested'),
  scheduled('scheduled'),
  completed('completed'),
  cancelled('cancelled');

  const ConsultationStatus(this.json);

  @override
  final String json;

  static ConsultationStatus fromJson(Object? raw) => enumFromJson(values, raw, ConsultationStatus.requested);

  static ConsultationStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `ChecklistStatus` (PLAN §5).
enum ChecklistStatus with JsonEnum {
  pending('pending'),
  inProgress('in_progress'),
  done('done');

  const ChecklistStatus(this.json);

  @override
  final String json;

  static ChecklistStatus fromJson(Object? raw) => enumFromJson(values, raw, ChecklistStatus.pending);

  static ChecklistStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `ItineraryKind` (PLAN §5).
enum ItineraryKind with JsonEnum {
  appointment('appointment'),
  admission('admission'),
  surgery('surgery'),
  pickup('pickup'),
  checkin('checkin'),
  checkout('checkout'),
  followup('followup'),
  sightseeing('sightseeing'),
  other('other');

  const ItineraryKind(this.json);

  @override
  final String json;

  @override
  String get label => switch (this) {
    ItineraryKind.checkin => 'Check-in',
    ItineraryKind.checkout => 'Check-out',
    ItineraryKind.followup => 'Follow-up',
    _ => humanizeEnumValue(json),
  };

  static ItineraryKind fromJson(Object? raw) => enumFromJson(values, raw, ItineraryKind.other);

  static ItineraryKind? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `VisaStatus` (PLAN §5).
enum VisaStatus with JsonEnum {
  notStarted('not_started'),
  documentsPending('documents_pending'),
  invitationIssued('invitation_issued'),
  applied('applied'),
  approved('approved'),
  rejected('rejected');

  const VisaStatus(this.json);

  @override
  final String json;

  static VisaStatus fromJson(Object? raw) => enumFromJson(values, raw, VisaStatus.notStarted);

  static VisaStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `TravelKind` (PLAN §5).
enum TravelKind with JsonEnum {
  flight('flight'),
  airportPickup('airport_pickup'),
  airportDrop('airport_drop'),
  localTransport('local_transport');

  const TravelKind(this.json);

  @override
  final String json;

  static TravelKind fromJson(Object? raw) => enumFromJson(values, raw, TravelKind.flight);

  static TravelKind? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `ServiceBookingStatus` (PLAN §5).
enum ServiceBookingStatus with JsonEnum {
  requested('requested'),
  quoted('quoted'),
  confirmed('confirmed'),
  completed('completed'),
  cancelled('cancelled');

  const ServiceBookingStatus(this.json);

  @override
  final String json;

  static ServiceBookingStatus fromJson(Object? raw) => enumFromJson(values, raw, ServiceBookingStatus.requested);

  static ServiceBookingStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `AccommodationType` (PLAN §5).
enum AccommodationType with JsonEnum {
  hotel('hotel'),
  guestHouse('guest_house'),
  serviceApartment('service_apartment'),
  hospitalGuestRoom('hospital_guest_room');

  const AccommodationType(this.json);

  @override
  final String json;

  static AccommodationType fromJson(Object? raw) => enumFromJson(values, raw, AccommodationType.hotel);

  static AccommodationType? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `ServiceKind` (PLAN §5).
enum ServiceKind with JsonEnum {
  translator('translator'),
  localGuide('local_guide'),
  transport('transport'),
  travelAgent('travel_agent'),
  insurance('insurance');

  const ServiceKind(this.json);

  @override
  final String json;

  static ServiceKind fromJson(Object? raw) => enumFromJson(values, raw, ServiceKind.translator);

  static ServiceKind? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `DocumentKind` (PLAN §5).
enum DocumentKind with JsonEnum {
  passport('passport'),
  visa('visa'),
  medicalReport('medical_report'),
  prescription('prescription'),
  labResult('lab_result'),
  imaging('imaging'),
  invitationLetter('invitation_letter'),
  invoice('invoice'),
  receipt('receipt'),
  kycRegistration('kyc_registration'),
  kycAccreditation('kyc_accreditation'),
  kycPan('kyc_pan'),
  kycGst('kyc_gst'),
  kycIdProof('kyc_id_proof'),
  bankProof('bank_proof'),
  paymentProof('payment_proof'),
  other('other');

  const DocumentKind(this.json);

  @override
  final String json;

  @override
  String get label => switch (this) {
    DocumentKind.kycPan => 'PAN card',
    DocumentKind.kycGst => 'GST certificate',
    DocumentKind.kycIdProof => 'ID proof',
    _ => humanizeEnumValue(json),
  };

  static DocumentKind fromJson(Object? raw) => enumFromJson(values, raw, DocumentKind.other);

  static DocumentKind? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `DocumentStatus` (PLAN §5).
enum DocumentStatus with JsonEnum {
  uploaded('uploaded'),
  verified('verified'),
  rejected('rejected');

  const DocumentStatus(this.json);

  @override
  final String json;

  static DocumentStatus fromJson(Object? raw) => enumFromJson(values, raw, DocumentStatus.uploaded);

  static DocumentStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `ConsentKind` (PLAN §5).
enum ConsentKind with JsonEnum {
  terms('terms'),
  privacy('privacy'),
  aiProcessing('ai_processing'),
  shareWithHospitals('share_with_hospitals'),
  marketing('marketing');

  const ConsentKind(this.json);

  @override
  final String json;

  static ConsentKind fromJson(Object? raw) => enumFromJson(values, raw, ConsentKind.terms);

  static ConsentKind? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `PaymentGateway` (PLAN §5).
enum PaymentGateway with JsonEnum {
  razorpay('razorpay'),
  stripe('stripe'),
  bankTransfer('bank_transfer'),
  mock('mock');

  const PaymentGateway(this.json);

  @override
  final String json;

  @override
  String get label => switch (this) {
    PaymentGateway.razorpay => 'Credit/Debit Card',
    PaymentGateway.stripe => 'Card (Stripe)',
    PaymentGateway.bankTransfer => 'Bank Transfer',
    PaymentGateway.mock => 'Test payment',
  };

  static PaymentGateway fromJson(Object? raw) => enumFromJson(values, raw, PaymentGateway.razorpay);

  static PaymentGateway? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `PaymentPurpose` (PLAN §5).
enum PaymentPurpose with JsonEnum {
  consultationFee('consultation_fee'),
  bookingDeposit('booking_deposit'),
  bookingBalance('booking_balance'),
  bookingFull('booking_full'),
  installment('installment'),
  service('service');

  const PaymentPurpose(this.json);

  @override
  final String json;

  static PaymentPurpose fromJson(Object? raw) => enumFromJson(values, raw, PaymentPurpose.consultationFee);

  static PaymentPurpose? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `OrderStatus` (PLAN §5).
enum OrderStatus with JsonEnum {
  created('created'),
  pending('pending'),
  paid('paid'),
  partiallyRefunded('partially_refunded'),
  refunded('refunded'),
  failed('failed'),
  expired('expired'),
  cancelled('cancelled');

  const OrderStatus(this.json);

  @override
  final String json;

  static OrderStatus fromJson(Object? raw) => enumFromJson(values, raw, OrderStatus.created);

  static OrderStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `PaymentStatus` (PLAN §5).
enum PaymentStatus with JsonEnum {
  created('created'),
  authorized('authorized'),
  captured('captured'),
  failed('failed'),
  refunded('refunded'),
  partiallyRefunded('partially_refunded');

  const PaymentStatus(this.json);

  @override
  final String json;

  static PaymentStatus fromJson(Object? raw) => enumFromJson(values, raw, PaymentStatus.created);

  static PaymentStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `RefundStatus` (PLAN §5).
enum RefundStatus with JsonEnum {
  requested('requested'),
  approved('approved'),
  processing('processing'),
  processed('processed'),
  failed('failed'),
  rejected('rejected');

  const RefundStatus(this.json);

  @override
  final String json;

  static RefundStatus fromJson(Object? raw) => enumFromJson(values, raw, RefundStatus.requested);

  static RefundStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `InstallmentStatus` (PLAN §5).
enum InstallmentStatus with JsonEnum {
  due('due'),
  paid('paid'),
  overdue('overdue'),
  cancelled('cancelled');

  const InstallmentStatus(this.json);

  @override
  final String json;

  static InstallmentStatus fromJson(Object? raw) => enumFromJson(values, raw, InstallmentStatus.due);

  static InstallmentStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `InvoiceKind` (PLAN §5).
enum InvoiceKind with JsonEnum {
  patientReceipt('patient_receipt'),
  commissionInvoice('commission_invoice'),
  agentStatement('agent_statement');

  const InvoiceKind(this.json);

  @override
  final String json;

  static InvoiceKind fromJson(Object? raw) => enumFromJson(values, raw, InvoiceKind.patientReceipt);

  static InvoiceKind? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `PayeeType` (PLAN §5).
enum PayeeType with JsonEnum {
  hospital('hospital'),
  agent('agent'),
  vendor('vendor');

  const PayeeType(this.json);

  @override
  final String json;

  static PayeeType fromJson(Object? raw) => enumFromJson(values, raw, PayeeType.hospital);

  static PayeeType? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `ItineraryItemStatus` (PLAN §4 value set).
enum ItineraryItemStatus with JsonEnum {
  scheduled('scheduled'),
  done('done'),
  cancelled('cancelled');

  const ItineraryItemStatus(this.json);

  @override
  final String json;

  static ItineraryItemStatus fromJson(Object? raw) => enumFromJson(values, raw, ItineraryItemStatus.scheduled);

  static ItineraryItemStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `VisaType` (PLAN §4 value set).
enum VisaType with JsonEnum {
  eMedical('e_medical'),
  eMedicalAttendant('e_medical_attendant');

  const VisaType(this.json);

  @override
  final String json;

  @override
  String get label => switch (this) {
    VisaType.eMedical => 'e-Medical Visa',
    VisaType.eMedicalAttendant => 'e-Medical Attendant Visa',
  };

  static VisaType fromJson(Object? raw) => enumFromJson(values, raw, VisaType.eMedical);

  static VisaType? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `SosStatus` (PLAN §4 value set).
enum SosStatus with JsonEnum {
  open('open'),
  acknowledged('acknowledged'),
  resolved('resolved');

  const SosStatus(this.json);

  @override
  final String json;

  static SosStatus fromJson(Object? raw) => enumFromJson(values, raw, SosStatus.open);

  static SosStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `ConversationKind` (PLAN §4 value set).
enum ConversationKind with JsonEnum {
  caseThread('case'),
  support('support'),
  direct('direct');

  const ConversationKind(this.json);

  @override
  final String json;

  static ConversationKind fromJson(Object? raw) => enumFromJson(values, raw, ConversationKind.direct);

  static ConversationKind? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `SavedEntityType` (PLAN §4 value set).
enum SavedEntityType with JsonEnum {
  hospital('hospital'),
  doctor('doctor'),
  procedure('procedure');

  const SavedEntityType(this.json);

  @override
  final String json;

  static SavedEntityType fromJson(Object? raw) => enumFromJson(values, raw, SavedEntityType.hospital);

  static SavedEntityType? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `ConsultationMode` (PLAN §4 value set).
enum ConsultationMode with JsonEnum {
  video('video'),
  phone('phone');

  const ConsultationMode(this.json);

  @override
  final String json;

  static ConsultationMode fromJson(Object? raw) => enumFromJson(values, raw, ConsultationMode.video);

  static ConsultationMode? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `SlotKind` (PLAN §4 value set).
enum SlotKind with JsonEnum {
  consultation('consultation'),
  admission('admission');

  const SlotKind(this.json);

  @override
  final String json;

  static SlotKind fromJson(Object? raw) => enumFromJson(values, raw, SlotKind.consultation);

  static SlotKind? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `TriageEngine` (PLAN §4 value set).
enum TriageEngine with JsonEnum {
  claude('claude'),
  rules('rules');

  const TriageEngine(this.json);

  @override
  final String json;

  @override
  String get label => switch (this) {
    TriageEngine.claude => 'AI (Claude)',
    TriageEngine.rules => 'Rules engine',
  };

  static TriageEngine fromJson(Object? raw) => enumFromJson(values, raw, TriageEngine.claude);

  static TriageEngine? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `Likelihood` (PLAN §4 value set).
enum Likelihood with JsonEnum {
  low('low'),
  medium('medium'),
  high('high');

  const Likelihood(this.json);

  @override
  final String json;

  static Likelihood fromJson(Object? raw) => enumFromJson(values, raw, Likelihood.medium);

  static Likelihood? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `DevicePlatform` (PLAN §4 value set).
enum DevicePlatform with JsonEnum {
  android('android'),
  ios('ios'),
  web('web');

  const DevicePlatform(this.json);

  @override
  final String json;

  static DevicePlatform fromJson(Object? raw) => enumFromJson(values, raw, DevicePlatform.android);

  static DevicePlatform? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// Values of `screenings.previous_treatments` (PLAN §4.6).
enum PreviousTreatment with JsonEnum {
  medication('medication'),
  physicalTherapy('physical_therapy'),
  surgery('surgery'),
  other('other');

  const PreviousTreatment(this.json);

  @override
  final String json;

  static PreviousTreatment fromJson(Object? raw) => enumFromJson(values, raw, PreviousTreatment.other);

  static PreviousTreatment? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// Values of `checklist_items.key` (PLAN §4.7).
enum ChecklistKey with JsonEnum {
  treatmentBooked('treatment_booked'),
  visaApproved('visa_approved'),
  flightBooked('flight_booked'),
  travelInsurance('travel_insurance'),
  airportPickup('airport_pickup'),
  documentsUploaded('documents_uploaded'),
  accommodationBooked('accommodation_booked');

  const ChecklistKey(this.json);

  @override
  final String json;

  @override
  String get label => switch (this) {
    ChecklistKey.flightBooked => 'Flight Booking',
    _ => humanizeEnumValue(json),
  };

  static ChecklistKey fromJson(Object? raw) => enumFromJson(values, raw, ChecklistKey.treatmentBooked);

  static ChecklistKey? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}
