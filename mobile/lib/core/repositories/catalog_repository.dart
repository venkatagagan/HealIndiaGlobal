import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_preferences.dart';
import '../models/models.dart';
import '../network/api_client.dart';

/// Public catalog endpoints (PLAN §8.4). All calls work without a session.
///
/// Priced reads pass `?currency=` (the patient's display currency) so the API adds approximate
/// `display_*` amounts next to the original INR prices.
class CatalogRepository {
  CatalogRepository(this._api, {this.currency});

  final ApiClient _api;

  /// Display currency for `display_*` amounts (null: the server default).
  final String? currency;

  /// `GET /specialties`
  Future<List<Specialty>> specialties() async => parseList(await _api.get('/specialties'), Specialty.fromJson);

  /// `GET /specialties/{slug}`
  Future<Specialty> specialty(String slug) async =>
      Specialty.fromJson(asJsonMap(await _api.get('/specialties/${Uri.encodeComponent(slug)}')));

  /// `GET /procedures?specialty=&q=`
  Future<List<Procedure>> procedures({String? specialty, String? q}) async => parseList(
    await _api.get('/procedures', query: {'specialty': specialty, 'q': q, 'currency': currency}),
    Procedure.fromJson,
  );

  /// `GET /procedures/{slug}`
  Future<Procedure> procedure(String slug) async => Procedure.fromJson(
    asJsonMap(await _api.get('/procedures/${Uri.encodeComponent(slug)}', query: {'currency': currency})),
  );

  /// `GET /procedures/{slug}/earliest` — hospitals offering it, earliest free admission day first.
  Future<ProcedureEarliest> procedureEarliest(String slug, {int limit = 20}) async => ProcedureEarliest.fromJson(
    asJsonMap(
      await _api.get('/procedures/${Uri.encodeComponent(slug)}/earliest', query: {'limit': limit, 'currency': currency}),
    ),
  );

  /// `GET /hospitals?q=&city=&specialty=&procedure=&accreditation=&language=&sort=rating|price|name|soonest&page=`
  Future<Paged<HospitalCard>> hospitals({
    String? q,
    String? city,
    String? specialty,
    String? procedure,
    String? accreditation,
    String? language,
    String? sort,
    int page = 1,
    int pageSize = 20,
  }) async => Paged.fromJson(
    await _api.get(
      '/hospitals',
      query: {
        'q': q,
        'city': city,
        'specialty': specialty,
        'procedure': procedure,
        'accreditation': accreditation,
        'language': language,
        'sort': sort,
        'page': page,
        'page_size': pageSize,
        'currency': currency,
      },
    ),
    HospitalCard.fromJson,
  );

  /// `GET /hospitals/{slug_or_id}`
  Future<HospitalDetail> hospital(String slugOrId) async => HospitalDetail.fromJson(
    asJsonMap(await _api.get('/hospitals/${Uri.encodeComponent(slugOrId)}', query: {'currency': currency})),
  );

  /// `GET /hospitals/{slug_or_id}/reviews?page=` — published reviews, newest first.
  Future<Paged<Review>> hospitalReviews(String slugOrId, {int page = 1, int pageSize = 20}) async => Paged.fromJson(
    await _api.get(
      '/hospitals/${Uri.encodeComponent(slugOrId)}/reviews',
      query: {'page': page, 'page_size': pageSize},
    ),
    Review.fromJson,
  );

  /// `GET /doctors?q=&specialty=&hospital_id=&language=&gender=&procedure=&sort=soonest|experience&page=`
  Future<Paged<DoctorCard>> doctors({
    String? q,
    String? specialty,
    String? hospitalId,
    String? language,
    Gender? gender,
    String? procedure,
    String? sort,
    int page = 1,
    int pageSize = 20,
  }) async => Paged.fromJson(
    await _api.get(
      '/doctors',
      query: {
        'q': q,
        'specialty': specialty,
        'hospital_id': hospitalId,
        'language': language,
        'gender': gender?.json,
        'procedure': procedure,
        'sort': sort,
        'page': page,
        'page_size': pageSize,
        'currency': currency,
      },
    ),
    DoctorCard.fromJson,
  );

  /// `GET /doctors/{id}`
  Future<DoctorDetail> doctor(String id) async => DoctorDetail.fromJson(
    asJsonMap(await _api.get('/doctors/${Uri.encodeComponent(id)}', query: {'currency': currency})),
  );

  /// `GET /doctors/{id}/reviews?page=`
  Future<Paged<Review>> doctorReviews(String id, {int page = 1, int pageSize = 20}) async => Paged.fromJson(
    await _api.get('/doctors/${Uri.encodeComponent(id)}/reviews', query: {'page': page, 'page_size': pageSize}),
    Review.fromJson,
  );

  /// `GET /doctors/{id}/availability?from=&to=`
  Future<List<AvailabilitySlot>> doctorAvailability(String doctorId, {DateTime? from, DateTime? to}) async => parseList(
    await _api.get('/doctors/$doctorId/availability', query: {'from': from, 'to': to}),
    AvailabilitySlot.fromJson,
  );

  /// `GET /hospitals/{id}/availability?from=&to=&doctor_id=`
  Future<List<AvailabilitySlot>> hospitalAvailability(
    String hospitalId, {
    DateTime? from,
    DateTime? to,
    String? doctorId,
  }) async => parseList(
    await _api.get('/hospitals/$hospitalId/availability', query: {'from': from, 'to': to, 'doctor_id': doctorId}),
    AvailabilitySlot.fromJson,
  );

  /// `GET /cost-comparison?procedure=<slug>&country=US&currency=USD` (country null: detected by the API).
  Future<CostComparison> costComparison({required String procedure, String? country, String? currency}) async =>
      CostComparison.fromJson(
        asJsonMap(
          await _api.get(
            '/cost-comparison',
            query: {'procedure': procedure, 'country': country, 'currency': currency ?? this.currency},
          ),
        ),
      );

  /// `GET /cost-comparison/highlights?country=&currency=&limit=` (country null: detected by the API).
  Future<CostHighlights> costHighlights({String? country, String? currency, int limit = 6}) async =>
      CostHighlights.fromJson(
        asJsonMap(
          await _api.get(
            '/cost-comparison/highlights',
            query: {'country': country, 'currency': currency ?? this.currency, 'limit': limit},
          ),
        ),
      );

  /// `GET /search?q=`
  Future<SearchResults> search(String q) async =>
      SearchResults.fromJson(asJsonMap(await _api.get('/search', query: {'q': q, 'currency': currency})));

  /// `GET /content/cultural-tips`
  Future<List<CulturalTip>> culturalTips() async =>
      parseList(await _api.get('/content/cultural-tips'), CulturalTip.fromJson);

  /// `GET /content/helplines`
  Future<Helplines> helplines() async => Helplines.fromJson(asJsonMap(await _api.get('/content/helplines')));

  /// `GET /content/fx-rates`
  Future<List<FxRate>> fxRates() async => parseList(await _api.get('/content/fx-rates'), FxRate.fromJson);

  /// `GET /content/symptoms?specialty=&body_area=`
  Future<List<SymptomInfo>> symptoms({String? specialty, String? bodyArea}) async => parseList(
    await _api.get('/content/symptoms', query: {'specialty': specialty, 'body_area': bodyArea}),
    SymptomInfo.fromJson,
  );

  /// `GET /accommodations?city=&hospital_id=`
  Future<List<AccommodationProvider>> accommodations({String? city, String? hospitalId}) async => parseList(
    await _api.get('/accommodations', query: {'city': city, 'hospital_id': hospitalId}),
    AccommodationProvider.fromJson,
  );

  /// `GET /service-providers?kind=&city=&language=`
  Future<List<LocalServiceProvider>> serviceProviders({ServiceKind? kind, String? city, String? language}) async =>
      parseList(
        await _api.get('/service-providers', query: {'kind': kind?.json, 'city': city, 'language': language}),
        LocalServiceProvider.fromJson,
      );
}

/// Rebuilt when the display currency changes, so every priced catalog read refreshes its `display_*` amounts.
final catalogRepositoryProvider = Provider<CatalogRepository>(
  (ref) => CatalogRepository(ref.watch(apiClientProvider), currency: ref.watch(preferredCurrencyProvider)),
);

/// All active specialties (home grid). Kept alive for the session.
final specialtiesProvider = FutureProvider<List<Specialty>>(
  (ref) => ref.watch(catalogRepositoryProvider).specialties(),
);

/// Hospital detail by slug or id.
final hospitalDetailProvider = FutureProvider.autoDispose.family<HospitalDetail, String>(
  (ref, slugOrId) => ref.watch(catalogRepositoryProvider).hospital(slugOrId),
);

/// Doctor detail by id.
final doctorDetailProvider = FutureProvider.autoDispose.family<DoctorDetail, String>(
  (ref, id) => ref.watch(catalogRepositoryProvider).doctor(id),
);

/// Procedure detail by slug.
final procedureDetailProvider = FutureProvider.autoDispose.family<Procedure, String>(
  (ref, slug) => ref.watch(catalogRepositoryProvider).procedure(slug),
);

/// Hospitals offering a procedure, earliest date first.
final procedureEarliestProvider = FutureProvider.autoDispose.family<ProcedureEarliest, String>(
  (ref, slug) => ref.watch(catalogRepositoryProvider).procedureEarliest(slug),
);

/// Unified search (debounce in the UI before changing the query).
final searchResultsProvider = FutureProvider.autoDispose.family<SearchResults, String>((ref, q) {
  if (q.trim().length < 2) return Future.value(const SearchResults());
  return ref.watch(catalogRepositoryProvider).search(q.trim());
});

/// Arguments of [costComparisonProvider].
typedef CostComparisonArgs = ({String procedure, String? country, String? currency});

final costComparisonProvider = FutureProvider.autoDispose.family<CostComparison, CostComparisonArgs>(
  (ref, a) => ref
      .watch(catalogRepositoryProvider)
      .costComparison(procedure: a.procedure, country: a.country, currency: a.currency),
);

/// Home-country override picked on the home screen ("Prices for `country` · change"). Null: let the API
/// detect the country (profile, account, network).
final homeCountryProvider = NotifierProvider<HomeCountryController, String?>(HomeCountryController.new);

class HomeCountryController extends Notifier<String?> {
  static const prefKey = 'hig.home_country';

  @override
  String? build() => ref.watch(sharedPreferencesProvider).getString(prefKey);

  Future<void> set(String? country) async {
    final prefs = ref.read(sharedPreferencesProvider);
    if (country == null) {
      await prefs.remove(prefKey);
    } else {
      await prefs.setString(prefKey, country.toUpperCase());
    }
    state = country?.toUpperCase();
  }
}

/// "Your country vs India" highlights for the home screen (country override + display currency).
final costHighlightsProvider = FutureProvider.autoDispose<CostHighlights>((ref) {
  final country = ref.watch(homeCountryProvider);
  return ref.watch(catalogRepositoryProvider).costHighlights(country: country);
});

final culturalTipsProvider = FutureProvider<List<CulturalTip>>(
  (ref) => ref.watch(catalogRepositoryProvider).culturalTips(),
);

final helplinesProvider = FutureProvider<Helplines>((ref) => ref.watch(catalogRepositoryProvider).helplines());

/// FX table: currency -> INR per 1 unit (for display-only conversions with `convertMinor`).
final fxRatesProvider = FutureProvider<Map<String, double>>((ref) async {
  final rates = await ref.watch(catalogRepositoryProvider).fxRates();
  return {for (final r in rates) r.quoteCurrency.toUpperCase(): r.rate};
});
