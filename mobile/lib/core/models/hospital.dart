import 'doctor.dart';
import 'json.dart';
import 'package.dart';

/// `HospitalCard` (PLAN §8.4).
class HospitalCard {
  const HospitalCard({
    required this.id,
    required this.slug,
    required this.name,
    this.city,
    this.state,
    this.accreditations = const [],
    this.ratingAvg,
    this.ratingCount = 0,
    this.logoUrl,
    this.coverImageUrl,
    this.specialties = const [],
    this.languages = const [],
    this.internationalDesk = false,
    this.startingPriceMinor,
    this.currency = 'INR',
  });

  factory HospitalCard.fromJson(JsonMap j) => HospitalCard(
    id: jStr(j, 'id'),
    slug: jStr(j, 'slug'),
    name: jStr(j, 'name'),
    city: jStrOrNull(j, 'city'),
    state: jStrOrNull(j, 'state'),
    accreditations: jStrList(j, 'accreditations'),
    ratingAvg: jDoubleOrNull(j, 'rating_avg'),
    ratingCount: jInt(j, 'rating_count'),
    logoUrl: jStrOrNull(j, 'logo_url'),
    coverImageUrl: jStrOrNull(j, 'cover_image_url'),
    specialties: jStrList(j, 'specialties'),
    languages: jStrList(j, 'languages'),
    internationalDesk: jBool(j, 'international_desk'),
    startingPriceMinor: jIntOrNull(j, 'starting_price_minor'),
    currency: jStr(j, 'currency', 'INR'),
  );

  final String id;
  final String slug;
  final String name;
  final String? city;
  final String? state;

  /// Lowercase values: `jci|nabh|nabl|iso`.
  final List<String> accreditations;
  final double? ratingAvg;
  final int ratingCount;
  final String? logoUrl;
  final String? coverImageUrl;

  /// Specialty names.
  final List<String> specialties;
  final List<String> languages;
  final bool internationalDesk;
  final int? startingPriceMinor;
  final String currency;

  /// `New Delhi, Delhi`
  String get location => [city, state].whereType<String>().where((s) => s.isNotEmpty).join(', ');

  bool get isJci => accreditations.contains('jci');
  bool get isNabh => accreditations.contains('nabh');

  Map<String, dynamic> toJson() => {
    'id': id,
    'slug': slug,
    'name': name,
    'city': city,
    'state': state,
    'accreditations': accreditations,
    'rating_avg': ratingAvg,
    'rating_count': ratingCount,
    'logo_url': logoUrl,
    'cover_image_url': coverImageUrl,
    'specialties': specialties,
    'languages': languages,
    'international_desk': internationalDesk,
    'starting_price_minor': startingPriceMinor,
    'currency': currency,
  };
}

/// `ReviewOut` (published reviews embedded in hospital detail).
class Review {
  const Review({
    required this.id,
    required this.rating,
    this.title,
    this.body,
    this.patientName,
    this.doctorId,
    this.createdAt,
  });

  factory Review.fromJson(JsonMap j) => Review(
    id: jStr(j, 'id'),
    rating: jInt(j, 'rating'),
    title: jStrOrNull(j, 'title'),
    body: jStrOrNull(j, 'body'),
    patientName: jStrOrNull(j, 'patient_name'),
    doctorId: jStrOrNull(j, 'doctor_id'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final int rating;
  final String? title;
  final String? body;
  final String? patientName;
  final String? doctorId;
  final DateTime? createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'rating': rating,
    'title': title,
    'body': body,
    'patient_name': patientName,
    'doctor_id': doctorId,
    'created_at': createdAt?.toUtc().toIso8601String(),
  };
}

/// `HospitalDetail = HospitalCard + {...}` (PLAN §8.4).
class HospitalDetail extends HospitalCard {
  const HospitalDetail({
    required super.id,
    required super.slug,
    required super.name,
    super.city,
    super.state,
    super.accreditations,
    super.ratingAvg,
    super.ratingCount,
    super.logoUrl,
    super.coverImageUrl,
    super.specialties,
    super.languages,
    super.internationalDesk,
    super.startingPriceMinor,
    super.currency,
    this.description,
    this.address,
    this.lat,
    this.lng,
    this.phone,
    this.email,
    this.website,
    this.establishedYear,
    this.bedCount,
    this.airportDistanceKm,
    this.doctors = const [],
    this.procedures = const [],
    this.reviews = const [],
  });

  factory HospitalDetail.fromJson(JsonMap j) {
    final c = HospitalCard.fromJson(j);
    return HospitalDetail(
      id: c.id,
      slug: c.slug,
      name: c.name,
      city: c.city,
      state: c.state,
      accreditations: c.accreditations,
      ratingAvg: c.ratingAvg,
      ratingCount: c.ratingCount,
      logoUrl: c.logoUrl,
      coverImageUrl: c.coverImageUrl,
      specialties: c.specialties,
      languages: c.languages,
      internationalDesk: c.internationalDesk,
      startingPriceMinor: c.startingPriceMinor,
      currency: c.currency,
      description: jStrOrNull(j, 'description'),
      address: jStrOrNull(j, 'address'),
      lat: jDoubleOrNull(j, 'lat'),
      lng: jDoubleOrNull(j, 'lng'),
      phone: jStrOrNull(j, 'phone'),
      email: jStrOrNull(j, 'email'),
      website: jStrOrNull(j, 'website'),
      establishedYear: jIntOrNull(j, 'established_year'),
      bedCount: jIntOrNull(j, 'bed_count'),
      airportDistanceKm: jDoubleOrNull(j, 'airport_distance_km'),
      doctors: jList(j, 'doctors', DoctorCard.fromJson),
      procedures: jList(j, 'procedures', HospitalProcedure.fromJson),
      reviews: jList(j, 'reviews', Review.fromJson),
    );
  }

  final String? description;
  final String? address;
  final double? lat;
  final double? lng;
  final String? phone;
  final String? email;
  final String? website;
  final int? establishedYear;
  final int? bedCount;
  final double? airportDistanceKm;
  final List<DoctorCard> doctors;
  final List<HospitalProcedure> procedures;
  final List<Review> reviews;

  @override
  Map<String, dynamic> toJson() => {
    ...super.toJson(),
    'description': description,
    'address': address,
    'lat': lat,
    'lng': lng,
    'phone': phone,
    'email': email,
    'website': website,
    'established_year': establishedYear,
    'bed_count': bedCount,
    'airport_distance_km': airportDistanceKm,
    'doctors': doctors.map((d) => d.toJson()).toList(),
    'procedures': procedures.map((p) => p.toJson()).toList(),
    'reviews': reviews.map((r) => r.toJson()).toList(),
  };
}

/// `[{date, slot_kind, capacity, booked, available}]` from the availability endpoints.
class AvailabilitySlot {
  const AvailabilitySlot({
    required this.date,
    required this.slotKind,
    required this.capacity,
    required this.booked,
    required this.available,
  });

  factory AvailabilitySlot.fromJson(JsonMap j) {
    final capacity = jInt(j, 'capacity');
    final booked = jInt(j, 'booked');
    return AvailabilitySlot(
      date: jDay(j, 'date') ?? DateTime.now(),
      slotKind: jStr(j, 'slot_kind', 'consultation'),
      capacity: capacity,
      booked: booked,
      available: jInt(j, 'available', capacity - booked),
    );
  }

  final DateTime date;

  /// `consultation | admission`
  final String slotKind;
  final int capacity;
  final int booked;
  final int available;

  bool get isAvailable => available > 0;

  Map<String, dynamic> toJson() => {
    'date': toApiDate(date),
    'slot_kind': slotKind,
    'capacity': capacity,
    'booked': booked,
    'available': available,
  };
}
