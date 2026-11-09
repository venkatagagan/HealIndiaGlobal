import 'doctor.dart';
import 'enums.dart';
import 'hospital.dart';
import 'json.dart';
import 'procedure.dart';
import 'specialty.dart';

/// `GET /search?q=` -> `{specialties[], procedures[], hospitals[], doctors[]}` (≤5 each).
class SearchResults {
  const SearchResults({
    this.specialties = const [],
    this.procedures = const [],
    this.hospitals = const [],
    this.doctors = const [],
  });

  factory SearchResults.fromJson(JsonMap j) => SearchResults(
    specialties: jList(j, 'specialties', Specialty.fromJson),
    procedures: jList(j, 'procedures', Procedure.fromJson),
    hospitals: jList(j, 'hospitals', HospitalCard.fromJson),
    doctors: jList(j, 'doctors', DoctorCard.fromJson),
  );

  final List<Specialty> specialties;
  final List<Procedure> procedures;
  final List<HospitalCard> hospitals;
  final List<DoctorCard> doctors;

  bool get isEmpty => specialties.isEmpty && procedures.isEmpty && hospitals.isEmpty && doctors.isEmpty;

  Map<String, dynamic> toJson() => {
    'specialties': specialties.map((e) => e.toJson()).toList(),
    'procedures': procedures.map((e) => e.toJson()).toList(),
    'hospitals': hospitals.map((e) => e.toJson()).toList(),
    'doctors': doctors.map((e) => e.toJson()).toList(),
  };
}

/// `/content/cultural-tips` item.
class CulturalTip {
  const CulturalTip({required this.id, required this.title, required this.body, this.imageUrl, this.category});

  factory CulturalTip.fromJson(JsonMap j) => CulturalTip(
    id: jStr(j, 'id'),
    title: jStr(j, 'title'),
    body: jStr(j, 'body'),
    imageUrl: jStrOrNull(j, 'image_url'),
    category: jStrOrNull(j, 'category'),
  );

  final String id;
  final String title;
  final String body;
  final String? imageUrl;
  final String? category;

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'body': body,
    'image_url': imageUrl,
    'category': category,
  };
}

/// `/content/helplines` -> `{"24x7": "...", "whatsapp": "...", "emergency": "112"}`.
class Helplines {
  const Helplines(this.numbers);

  factory Helplines.fromJson(JsonMap j) {
    final src = j['helplines'] is Map ? asJsonMap(j['helplines']) : j;
    return Helplines({
      for (final e in src.entries)
        if (e.value != null) e.key: e.value.toString(),
    });
  }

  final Map<String, String> numbers;

  String? get support24x7 => numbers['24x7'];
  String? get whatsapp => numbers['whatsapp'];
  String get emergency => numbers['emergency'] ?? '112';

  Map<String, dynamic> toJson() => Map<String, dynamic>.from(numbers);
}

/// `/content/fx-rates` item: `rate` = INR per 1 unit of [quoteCurrency].
class FxRate {
  const FxRate({required this.quoteCurrency, required this.rate, this.baseCurrency = 'INR', this.asOf});

  factory FxRate.fromJson(JsonMap j) => FxRate(
    baseCurrency: jStr(j, 'base_currency', 'INR'),
    quoteCurrency: jStr(j, 'quote_currency'),
    rate: jDouble(j, 'rate'),
    asOf: jDate(j, 'as_of'),
  );

  final String baseCurrency;
  final String quoteCurrency;
  final double rate;
  final DateTime? asOf;

  Map<String, dynamic> toJson() => {
    'base_currency': baseCurrency,
    'quote_currency': quoteCurrency,
    'rate': rate,
    'as_of': asOf?.toUtc().toIso8601String(),
  };
}

/// `/content/symptoms` library entry.
class SymptomInfo {
  const SymptomInfo({required this.name, this.specialtySlugs = const [], this.bodyAreas = const []});

  factory SymptomInfo.fromJson(JsonMap j) => SymptomInfo(
    name: jStr(j, 'name'),
    specialtySlugs: jStrList(j, 'specialty_slugs'),
    bodyAreas: jStrList(j, 'body_areas'),
  );

  final String name;
  final List<String> specialtySlugs;
  final List<String> bodyAreas;

  Map<String, dynamic> toJson() => {'name': name, 'specialty_slugs': specialtySlugs, 'body_areas': bodyAreas};
}

/// `/accommodations` item (PLAN §4.8 accommodation_providers).
class AccommodationProvider {
  const AccommodationProvider({
    required this.id,
    required this.name,
    required this.type,
    this.city,
    this.address,
    this.lat,
    this.lng,
    this.starRating,
    this.amenities = const [],
    this.nightlyRateMinor,
    this.currency = 'INR',
    this.photos = const [],
    this.phone,
    this.email,
    this.distanceKm,
  });

  factory AccommodationProvider.fromJson(JsonMap j) => AccommodationProvider(
    id: jStr(j, 'id'),
    name: jStr(j, 'name'),
    type: AccommodationType.fromJson(j['type']),
    city: jStrOrNull(j, 'city'),
    address: jStrOrNull(j, 'address'),
    lat: jDoubleOrNull(j, 'lat'),
    lng: jDoubleOrNull(j, 'lng'),
    starRating: jDoubleOrNull(j, 'star_rating'),
    amenities: jStrList(j, 'amenities'),
    nightlyRateMinor: jIntOrNull(j, 'nightly_rate_minor'),
    currency: jStr(j, 'currency', 'INR'),
    photos: jStrList(j, 'photos'),
    phone: jStrOrNull(j, 'phone'),
    email: jStrOrNull(j, 'email'),
    distanceKm: jDoubleOrNull(j, 'distance_km'),
  );

  final String id;
  final String name;
  final AccommodationType type;
  final String? city;
  final String? address;
  final double? lat;
  final double? lng;
  final double? starRating;
  final List<String> amenities;
  final int? nightlyRateMinor;
  final String currency;
  final List<String> photos;
  final String? phone;
  final String? email;

  /// Distance to the hospital when filtered by `hospital_id`.
  final double? distanceKm;

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'type': type.json,
    'city': city,
    'address': address,
    'lat': lat,
    'lng': lng,
    'star_rating': starRating,
    'amenities': amenities,
    'nightly_rate_minor': nightlyRateMinor,
    'currency': currency,
    'photos': photos,
    'phone': phone,
    'email': email,
    'distance_km': distanceKm,
  };
}

/// `/service-providers` item (translator, local guide, transport...).
class LocalServiceProvider {
  const LocalServiceProvider({
    required this.id,
    required this.kind,
    required this.name,
    this.city,
    this.languages = const [],
    this.phone,
    this.email,
    this.rateMinor,
    this.rateUnit,
    this.currency = 'INR',
    this.ratingAvg,
  });

  factory LocalServiceProvider.fromJson(JsonMap j) => LocalServiceProvider(
    id: jStr(j, 'id'),
    kind: ServiceKind.fromJson(j['kind']),
    name: jStr(j, 'name'),
    city: jStrOrNull(j, 'city'),
    languages: jStrList(j, 'languages'),
    phone: jStrOrNull(j, 'phone'),
    email: jStrOrNull(j, 'email'),
    rateMinor: jIntOrNull(j, 'rate_minor'),
    rateUnit: jStrOrNull(j, 'rate_unit'),
    currency: jStr(j, 'currency', 'INR'),
    ratingAvg: jDoubleOrNull(j, 'rating_avg'),
  );

  final String id;
  final ServiceKind kind;
  final String name;
  final String? city;
  final List<String> languages;
  final String? phone;
  final String? email;
  final int? rateMinor;

  /// `hour|day|trip|fixed`
  final String? rateUnit;
  final String currency;
  final double? ratingAvg;

  Map<String, dynamic> toJson() => {
    'id': id,
    'kind': kind.json,
    'name': name,
    'city': city,
    'languages': languages,
    'phone': phone,
    'email': email,
    'rate_minor': rateMinor,
    'rate_unit': rateUnit,
    'currency': currency,
    'rating_avg': ratingAvg,
  };
}
