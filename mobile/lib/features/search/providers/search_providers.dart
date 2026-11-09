import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/patient_repository.dart';

/// Hospital sort options (`/hospitals?sort=`).
enum HospitalSort {
  rating('rating', 'Top rated'),
  price('price', 'Lowest price'),
  name('name', 'Name (A-Z)');

  const HospitalSort(this.json, this.label);

  final String json;
  final String label;
}

/// Accreditation filter values (`/hospitals?accreditation=`).
const kAccreditations = <String, String>{'jci': 'JCI', 'nabh': 'NABH', 'nabl': 'NABL', 'iso': 'ISO'};

/// Language filter options (doctor / hospital languages).
const kFilterLanguages = <String>['English', 'Hindi', 'Arabic', 'French', 'Russian', 'Bengali', 'Swahili', 'Spanish'];

/// Filters of the search tabs. `null` means "any".
@immutable
class SearchFilters {
  const SearchFilters({this.specialty, this.city, this.accreditation, this.language, this.sort, this.doctorGender});

  /// Specialty slug.
  final String? specialty;
  final String? city;

  /// `jci|nabh|nabl|iso`
  final String? accreditation;
  final String? language;
  final HospitalSort? sort;
  final Gender? doctorGender;

  /// Number of active filters (for the filter button badge).
  int get activeCount =>
      [specialty, city, accreditation, language, sort, doctorGender].where((v) => v != null).length;

  SearchFilters copyWith({
    ValueGetter<String?>? specialty,
    ValueGetter<String?>? city,
    ValueGetter<String?>? accreditation,
    ValueGetter<String?>? language,
    ValueGetter<HospitalSort?>? sort,
    ValueGetter<Gender?>? doctorGender,
  }) => SearchFilters(
    specialty: specialty == null ? this.specialty : specialty(),
    city: city == null ? this.city : city(),
    accreditation: accreditation == null ? this.accreditation : accreditation(),
    language: language == null ? this.language : language(),
    sort: sort == null ? this.sort : sort(),
    doctorGender: doctorGender == null ? this.doctorGender : doctorGender(),
  );

  /// Stable string used in widget keys so lists reload when filters change.
  String get cacheKey => [specialty, city, accreditation, language, sort?.json, doctorGender?.json].join('|');

  @override
  bool operator ==(Object other) => other is SearchFilters && other.cacheKey == cacheKey;

  @override
  int get hashCode => cacheKey.hashCode;
}

/// Arguments for [searchProceduresProvider].
typedef ProcedureQuery = ({String? q, String? specialty});

/// `/procedures?specialty=&q=` (not paginated by the API).
final searchProceduresProvider = FutureProvider.autoDispose.family<List<Procedure>, ProcedureQuery>((ref, args) {
  final q = args.q?.trim();
  return ref
      .watch(catalogRepositoryProvider)
      .procedures(specialty: args.specialty, q: q == null || q.isEmpty ? null : q);
});

/// Keys `"<entity_type>:<entity_id>"` of the signed-in patient's saved items. Empty for guests and
/// signed-out users (saving requires an account).
final savedKeysProvider = Provider.autoDispose<AsyncValue<Set<String>>>((ref) {
  final auth = ref.watch(authStateProvider);
  if (!auth.isAuthenticated) return const AsyncData(<String>{});
  return ref
      .watch(savedItemsProvider)
      .whenData((items) => {for (final i in items) savedKey(i.entityType, i.entityId)});
});

String savedKey(SavedEntityType type, String id) => '${type.json}:$id';

/// Availability window shown on detail screens (next 30 days).
typedef AvailabilityQuery = ({String id, bool doctor});

final availabilityPreviewProvider = FutureProvider.autoDispose.family<List<AvailabilitySlot>, AvailabilityQuery>((
  ref,
  q,
) {
  final repo = ref.watch(catalogRepositoryProvider);
  final from = DateTime.now();
  final to = from.add(const Duration(days: 30));
  return q.doctor ? repo.doctorAvailability(q.id, from: from, to: to) : repo.hospitalAvailability(q.id, from: from, to: to);
});
