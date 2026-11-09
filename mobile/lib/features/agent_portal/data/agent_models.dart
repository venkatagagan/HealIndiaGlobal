import '../../../core/models/models.dart';

/// `monthly[]` point of `GET /agent-portal/dashboard`.
class AgentMonthPoint {
  const AgentMonthPoint({required this.month, this.cases = 0, this.bookings = 0, this.commissionMinor = 0});

  factory AgentMonthPoint.fromJson(JsonMap j) => AgentMonthPoint(
    month: jStr(j, 'month'),
    cases: jInt(j, 'cases'),
    bookings: jInt(j, 'bookings'),
    commissionMinor: jInt(j, 'commission_minor'),
  );

  final String month;
  final int cases;
  final int bookings;
  final int commissionMinor;
}

/// `GET /agent-portal/dashboard` (PLAN §8.10).
class AgentDashboard {
  const AgentDashboard({
    required this.currency,
    this.patientsTotal = 0,
    this.activeCases = 0,
    this.bookingsConfirmed = 0,
    this.commissionPendingMinor = 0,
    this.commissionPaidMinor = 0,
    this.conversionRate = 0,
    this.monthly = const [],
    this.recentCases = const [],
  });

  factory AgentDashboard.fromJson(JsonMap j) => AgentDashboard(
    currency: jStr(j, 'currency', 'INR'),
    patientsTotal: jInt(j, 'patients_total'),
    activeCases: jInt(j, 'active_cases'),
    bookingsConfirmed: jInt(j, 'bookings_confirmed'),
    commissionPendingMinor: jInt(j, 'commission_pending_minor'),
    commissionPaidMinor: jInt(j, 'commission_paid_minor'),
    conversionRate: jDouble(j, 'conversion_rate'),
    monthly: jList(j, 'monthly', AgentMonthPoint.fromJson),
    recentCases: jList(j, 'recent_cases', MedicalCase.fromJson),
  );

  final String currency;
  final int patientsTotal;
  final int activeCases;
  final int bookingsConfirmed;
  final int commissionPendingMinor;
  final int commissionPaidMinor;

  /// 0..1 share of cases that converted to a booking.
  final double conversionRate;
  final List<AgentMonthPoint> monthly;
  final List<MedicalCase> recentCases;

  String get conversionLabel => '${(conversionRate * 100).toStringAsFixed(conversionRate * 100 % 1 == 0 ? 0 : 1)}%';
}

/// `GET /agent-portal/profile` (subset shown in the app).
class AgentProfile {
  const AgentProfile({
    required this.id,
    required this.agencyName,
    required this.agentCode,
    required this.status,
    required this.kycStatus,
    this.tier,
    this.commissionRateBps,
    this.rejectionReason,
    this.city,
    this.country,
  });

  factory AgentProfile.fromJson(JsonMap j) => AgentProfile(
    id: jStr(j, 'id'),
    agencyName: jStr(j, 'agency_name'),
    agentCode: jStr(j, 'agent_code'),
    status: AgentStatus.fromJson(j['status']),
    kycStatus: KycStatus.fromJson(j['kyc_status']),
    tier: jStrOrNull(j, 'tier'),
    commissionRateBps: jIntOrNull(j, 'commission_rate_bps'),
    rejectionReason: jStrOrNull(j, 'rejection_reason'),
    city: jStrOrNull(j, 'city'),
    country: jStrOrNull(j, 'country'),
  );

  final String id;
  final String agencyName;
  final String agentCode;
  final AgentStatus status;
  final KycStatus kycStatus;
  final String? tier;
  final int? commissionRateBps;
  final String? rejectionReason;
  final String? city;
  final String? country;

  bool get isActive => status == AgentStatus.active;
}

/// `GET /agent-portal/referral`.
class AgentReferral {
  const AgentReferral({required this.agentCode, required this.referralUrl});

  factory AgentReferral.fromJson(JsonMap j) =>
      AgentReferral(agentCode: jStr(j, 'agent_code'), referralUrl: jStr(j, 'referral_url'));

  final String agentCode;
  final String referralUrl;
}

/// `AgentPatientOut` — a patient the agent manages or referred.
class AgentPatient {
  const AgentPatient({
    required this.id,
    required this.userId,
    required this.fullName,
    this.firstName,
    this.lastName,
    this.email,
    this.phone,
    this.whatsapp,
    this.dateOfBirth,
    this.gender,
    this.nationality,
    this.countryOfResidence,
    this.passportLast4,
    this.passportExpiry,
    this.preferredLanguage,
    this.bloodGroup,
    this.allergies,
    this.medicalHistory,
    this.preferredCurrency = 'USD',
    this.isManaged = true,
    this.accountActivated = false,
    this.casesCount = 0,
    this.screeningsCount = 0,
    this.createdAt,
  });

  factory AgentPatient.fromJson(JsonMap j) => AgentPatient(
    id: jStr(j, 'id'),
    userId: jStr(j, 'user_id'),
    fullName: jStr(j, 'full_name', [jStr(j, 'first_name'), jStr(j, 'last_name')].join(' ').trim()),
    firstName: jStrOrNull(j, 'first_name'),
    lastName: jStrOrNull(j, 'last_name'),
    email: jStrOrNull(j, 'email'),
    phone: jStrOrNull(j, 'phone'),
    whatsapp: jStrOrNull(j, 'whatsapp'),
    dateOfBirth: jDay(j, 'date_of_birth'),
    gender: Gender.fromJsonOrNull(j['gender']),
    nationality: jStrOrNull(j, 'nationality'),
    countryOfResidence: jStrOrNull(j, 'country_of_residence'),
    passportLast4: jStrOrNull(j, 'passport_last4'),
    passportExpiry: jDay(j, 'passport_expiry'),
    preferredLanguage: jStrOrNull(j, 'preferred_language'),
    bloodGroup: jStrOrNull(j, 'blood_group'),
    allergies: jStrOrNull(j, 'allergies'),
    medicalHistory: jStrOrNull(j, 'medical_history'),
    preferredCurrency: jStr(j, 'preferred_currency', 'USD'),
    isManaged: jBool(j, 'is_managed', true),
    accountActivated: jBool(j, 'account_activated'),
    casesCount: jInt(j, 'cases_count'),
    screeningsCount: jInt(j, 'screenings_count'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String userId;
  final String fullName;
  final String? firstName;
  final String? lastName;
  final String? email;
  final String? phone;
  final String? whatsapp;
  final DateTime? dateOfBirth;
  final Gender? gender;
  final String? nationality;
  final String? countryOfResidence;
  final String? passportLast4;
  final DateTime? passportExpiry;
  final String? preferredLanguage;
  final String? bloodGroup;
  final String? allergies;
  final String? medicalHistory;
  final String preferredCurrency;
  final bool isManaged;
  final bool accountActivated;
  final int casesCount;
  final int screeningsCount;
  final DateTime? createdAt;
}

/// Body of `POST /agent-portal/patients` / `PATCH /agent-portal/patients/{id}`.
class AgentPatientInput {
  const AgentPatientInput({
    required this.firstName,
    required this.lastName,
    required this.nationality,
    this.email,
    this.phone,
    this.dateOfBirth,
    this.gender,
    this.medicalHistory,
    this.passportNumber,
    this.passportExpiry,
    this.allergies,
    this.bloodGroup,
  });

  final String firstName;
  final String lastName;

  /// ISO-3166 alpha-2.
  final String nationality;
  final String? email;
  final String? phone;
  final DateTime? dateOfBirth;
  final Gender? gender;
  final String? medicalHistory;
  final String? passportNumber;
  final DateTime? passportExpiry;
  final String? allergies;
  final String? bloodGroup;

  /// Create body (the API forbids unknown fields, so only `AgentPatientCreate` keys).
  JsonMap toCreateJson() => compactJson({
    'first_name': firstName.trim(),
    'last_name': lastName.trim(),
    'nationality': nationality.trim().toUpperCase(),
    'email': email?.trim(),
    'phone': phone?.trim(),
    'date_of_birth': dateOfBirth == null ? null : toApiDate(dateOfBirth!),
    'gender': gender?.json,
    'medical_history': medicalHistory?.trim(),
  }, dropEmptyStrings: true);

  /// Update body (`AgentPatientUpdate`).
  JsonMap toUpdateJson() => compactJson({
    ...toCreateJson(),
    'passport_number': passportNumber?.replaceAll(' ', '').toUpperCase(),
    'passport_expiry': passportExpiry == null ? null : toApiDate(passportExpiry!),
    'allergies': allergies?.trim(),
    'blood_group': bloodGroup?.trim(),
  }, dropEmptyStrings: true);
}
