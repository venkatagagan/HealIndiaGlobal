import 'enums.dart';
import 'json.dart';
import 'package.dart';
import 'refs.dart';

/// `DoctorCard` (PLAN §8.4).
class DoctorCard {
  const DoctorCard({
    required this.id,
    required this.slug,
    required this.fullName,
    required this.hospital,
    this.gender,
    this.photoUrl,
    this.specialty,
    this.qualifications = const [],
    this.experienceYears,
    this.languages = const [],
    this.successRatePct,
    this.ratingAvg,
    this.ratingCount = 0,
    this.consultationFeeMinor,
    this.currency = 'INR',
    this.teleconsultAvailable = false,
  });

  factory DoctorCard.fromJson(JsonMap j) => DoctorCard(
    id: jStr(j, 'id'),
    slug: jStr(j, 'slug'),
    fullName: jStr(j, 'full_name'),
    gender: Gender.fromJsonOrNull(j['gender']),
    photoUrl: jStrOrNull(j, 'photo_url'),
    specialty: jObj(j, 'specialty', EntityRef.fromJson),
    qualifications: jStrList(j, 'qualifications'),
    experienceYears: jIntOrNull(j, 'experience_years'),
    languages: jStrList(j, 'languages'),
    successRatePct: jDoubleOrNull(j, 'success_rate_pct'),
    ratingAvg: jDoubleOrNull(j, 'rating_avg'),
    ratingCount: jInt(j, 'rating_count'),
    consultationFeeMinor: jIntOrNull(j, 'consultation_fee_minor'),
    currency: jStr(j, 'currency', 'INR'),
    teleconsultAvailable: jBool(j, 'teleconsult_available'),
    hospital: HospitalRef.fromJson(jMap(j, 'hospital')),
  );

  final String id;
  final String slug;
  final String fullName;
  final Gender? gender;
  final String? photoUrl;
  final EntityRef? specialty;
  final List<String> qualifications;
  final int? experienceYears;
  final List<String> languages;
  final double? successRatePct;
  final double? ratingAvg;
  final int ratingCount;
  final int? consultationFeeMinor;
  final String currency;
  final bool teleconsultAvailable;
  final HospitalRef hospital;

  /// `Cardiologist | 15 years of experience`
  String get subtitle {
    final parts = <String>[
      if (specialty != null) specialty!.name,
      if (experienceYears != null) '$experienceYears years of experience',
    ];
    return parts.join(' | ');
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'slug': slug,
    'full_name': fullName,
    'gender': gender?.json,
    'photo_url': photoUrl,
    'specialty': specialty?.toJson(),
    'qualifications': qualifications,
    'experience_years': experienceYears,
    'languages': languages,
    'success_rate_pct': successRatePct,
    'rating_avg': ratingAvg,
    'rating_count': ratingCount,
    'consultation_fee_minor': consultationFeeMinor,
    'currency': currency,
    'teleconsult_available': teleconsultAvailable,
    'hospital': hospital.toJson(),
  };
}

/// `DoctorDetail = DoctorCard + {bio, sub_specialties[], procedures, next_available_date}`.
class DoctorDetail extends DoctorCard {
  const DoctorDetail({
    required super.id,
    required super.slug,
    required super.fullName,
    required super.hospital,
    super.gender,
    super.photoUrl,
    super.specialty,
    super.qualifications,
    super.experienceYears,
    super.languages,
    super.successRatePct,
    super.ratingAvg,
    super.ratingCount,
    super.consultationFeeMinor,
    super.currency,
    super.teleconsultAvailable,
    this.bio,
    this.subSpecialties = const [],
    this.procedures = const [],
    this.nextAvailableDate,
  });

  factory DoctorDetail.fromJson(JsonMap j) {
    final c = DoctorCard.fromJson(j);
    return DoctorDetail(
      id: c.id,
      slug: c.slug,
      fullName: c.fullName,
      hospital: c.hospital,
      gender: c.gender,
      photoUrl: c.photoUrl,
      specialty: c.specialty,
      qualifications: c.qualifications,
      experienceYears: c.experienceYears,
      languages: c.languages,
      successRatePct: c.successRatePct,
      ratingAvg: c.ratingAvg,
      ratingCount: c.ratingCount,
      consultationFeeMinor: c.consultationFeeMinor,
      currency: c.currency,
      teleconsultAvailable: c.teleconsultAvailable,
      bio: jStrOrNull(j, 'bio'),
      subSpecialties: jStrList(j, 'sub_specialties'),
      procedures: jList(j, 'procedures', HospitalProcedure.fromJson),
      nextAvailableDate: jDay(j, 'next_available_date'),
    );
  }

  final String? bio;
  final List<String> subSpecialties;
  final List<HospitalProcedure> procedures;
  final DateTime? nextAvailableDate;

  @override
  Map<String, dynamic> toJson() => {
    ...super.toJson(),
    'bio': bio,
    'sub_specialties': subSpecialties,
    'procedures': procedures.map((p) => p.toJson()).toList(),
    'next_available_date': nextAvailableDate == null ? null : toApiDate(nextAvailableDate!),
  };
}
