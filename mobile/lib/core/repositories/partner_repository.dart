import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_controller.dart';
import '../models/models.dart';
import '../network/api_client.dart';
import 'catalog_repository.dart';

/// Insurance products, pay-later partners, the patient's requests to them, and the interest-free
/// instalment rule (CG-18). The platform lists partners for information only: it sells no insurance,
/// lends no money and makes no credit decision.
class PartnerRepository {
  PartnerRepository(this._api);

  final ApiClient _api;

  /// `GET /insurance/products?country=XX` (public).
  Future<List<PartnerOffering>> insuranceProducts({String? country}) async =>
      parseList(await _api.get('/insurance/products', query: {'country': country}), PartnerOffering.fromJson);

  /// `GET /financing/partners?country=XX` (public).
  Future<List<PartnerOffering>> financingPartners({String? country}) async =>
      parseList(await _api.get('/financing/partners', query: {'country': country}), PartnerOffering.fromJson);

  /// `POST /insurance/requests` or `POST /financing/eligibility-checks` (by [kind]).
  Future<PartnerLead> createLead(PartnerKind kind, PartnerLeadRequest request) async =>
      PartnerLead.fromJson(asJsonMap(await _api.post(_leadsPath(kind), data: request.toJson(kind))));

  /// `GET /insurance/requests` or `GET /financing/eligibility-checks`: the patient's own.
  Future<List<PartnerLead>> myLeads(PartnerKind kind) async =>
      parseList(await _api.get(_leadsPath(kind)), PartnerLead.fromJson);

  /// `POST .../{id}/cancel`: withdraws the request and the consent to share contact details.
  Future<PartnerLead> cancelLead(PartnerKind kind, String id) async =>
      PartnerLead.fromJson(asJsonMap(await _api.post('${_leadsPath(kind)}/$id/cancel')));

  /// `GET /financing/installment-plan`: allowed months and the schedule for an admission date.
  Future<InstallmentPlan> installmentPlan(InstallmentPlanQuery q) async => InstallmentPlan.fromJson(
    asJsonMap(
      await _api.get(
        '/financing/installment-plan',
        query: {
          'admission_date': q.admissionDate,
          'months': q.months,
          'total_minor': q.totalMinor,
          'deposit_minor': q.depositMinor,
          'country': q.country,
        },
      ),
    ),
  );

  static String _leadsPath(PartnerKind kind) =>
      kind == PartnerKind.insurance ? '/insurance/requests' : '/financing/eligibility-checks';
}

/// Query of `GET /financing/installment-plan` (`admissionDate` is `YYYY-MM-DD`).
typedef InstallmentPlanQuery = ({
  String admissionDate,
  int? months,
  int? totalMinor,
  int? depositMinor,
  String? country,
});

final partnerRepositoryProvider = Provider<PartnerRepository>((ref) => PartnerRepository(ref.watch(apiClientProvider)));

/// The country partner lists open with: the account's country, else the home country picked on the
/// cost screen; null = all countries.
final partnerCountryProvider = Provider.autoDispose<String?>((ref) {
  final c = ref.watch(authStateProvider).user?.countryCode;
  if (c != null && c.length == 2) return c.toUpperCase();
  final home = ref.watch(homeCountryProvider);
  return home != null && home.length == 2 ? home.toUpperCase() : null;
});

final insuranceProductsProvider = FutureProvider.autoDispose.family<List<PartnerOffering>, String?>(
  (ref, country) => ref.watch(partnerRepositoryProvider).insuranceProducts(country: country),
);

final financingPartnersProvider = FutureProvider.autoDispose.family<List<PartnerOffering>, String?>(
  (ref, country) => ref.watch(partnerRepositoryProvider).financingPartners(country: country),
);

/// The patient's insurance requests and eligibility checks together, newest first.
final myPartnerLeadsProvider = FutureProvider.autoDispose<List<PartnerLead>>((ref) async {
  final auth = ref.watch(authStateProvider);
  if (!auth.hasSession || auth.user?.role != UserRole.patient) return const [];
  final repo = ref.watch(partnerRepositoryProvider);
  final results = await Future.wait([repo.myLeads(PartnerKind.insurance), repo.myLeads(PartnerKind.payLater)]);
  final all = [...results[0], ...results[1]];
  final epoch = DateTime.fromMillisecondsSinceEpoch(0);
  all.sort((a, b) => (b.createdAt ?? epoch).compareTo(a.createdAt ?? epoch));
  return all;
});

final installmentPlanProvider = FutureProvider.autoDispose.family<InstallmentPlan, InstallmentPlanQuery>(
  (ref, q) => ref.watch(partnerRepositoryProvider).installmentPlan(q),
);
