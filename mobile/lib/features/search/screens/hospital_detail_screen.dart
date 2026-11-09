import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../widgets/availability_strip.dart';
import '../widgets/catalog_cards.dart';
import '../widgets/detail_sections.dart';
import '../widgets/request_quote_sheet.dart';
import '../widgets/save_button.dart';

/// Hospital detail: overview, accreditations, treatments & prices, doctors, availability preview,
/// reviews, contact; save/unsave; Get matched / Request quote.
///
/// Route: `/hospitals/:id` (slug or id) · Owner: fl-onboarding.
class HospitalDetailScreen extends ConsumerWidget {
  const HospitalDetailScreen({super.key, required this.hospitalId});

  final String hospitalId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(hospitalDetailProvider(hospitalId));
    return value.when(
      loading: () => Scaffold(appBar: AppBar(), body: const LoadingView()),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: ErrorView(
          error: e,
          title: e is ApiException && e.isNotFound ? context.l10n.hospitalDetailNotFound : null,
          onRetry: () => ref.invalidate(hospitalDetailProvider(hospitalId)),
        ),
      ),
      data: (h) => _HospitalDetailView(hospital: h),
    );
  }
}

class _HospitalDetailView extends ConsumerWidget {
  const _HospitalDetailView({required this.hospital});

  final HospitalDetail hospital;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final h = hospital;
    final specialtySlug = h.doctors.map((d) => d.specialty?.slug).whereType<String>().firstOrNull;
    final cover = h.coverImageUrl;
    final l10n = context.l10n;

    return Scaffold(
      bottomNavigationBar: DetailActionsBar(
        onGetMatched: () => context.push(Routes.screeningStart(specialty: specialtySlug)),
        onRequestQuote: () =>
            requestQuote(context, ref, hospitalId: h.id, hospitalName: h.name, procedures: h.procedures),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(hospitalDetailProvider(h.id).future),
        child: CustomScrollView(
          slivers: [
            SliverAppBar(
              pinned: true,
              expandedHeight: 200,
              foregroundColor: Colors.white,
              backgroundColor: context.colors.surface,
              actions: [SaveButton(entityType: SavedEntityType.hospital, entityId: h.id, color: Colors.white)],
              flexibleSpace: FlexibleSpaceBar(
                background: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (cover != null && cover.isNotEmpty)
                      CachedNetworkImage(
                        imageUrl: cover,
                        fit: BoxFit.cover,
                        errorWidget: (_, _, _) => const _CoverPlaceholder(),
                      )
                    else
                      const _CoverPlaceholder(),
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Color(0x66000000), Color(0x00000000), Color(0x99000000)],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              sliver: SliverList.list(
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      HospitalImage(url: h.logoUrl, size: 52),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(h.name, style: context.text.headlineSmall),
                            if (h.location.isNotEmpty) Text(h.location, style: context.text.bodySmall),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (h.ratingAvg != null) ...[
                    const SizedBox(height: 8),
                    RatingStars(rating: h.ratingAvg!, count: h.ratingCount),
                  ],
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      AccreditationBadges(h.accreditations, dense: false),
                      if (h.internationalDesk)
                        StatusBadge(
                          label: l10n.catalogInternationalPatientDesk,
                          color: AppColors.violet,
                          icon: Icons.public_rounded,
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  AppCard(
                    child: Row(
                      children: [
                        InfoStat(
                          icon: Icons.history_edu_outlined,
                          value: h.establishedYear?.toString() ?? '-',
                          label: l10n.hospitalDetailEstablished,
                        ),
                        InfoStat(
                          icon: Icons.bed_outlined,
                          value: h.bedCount?.toString() ?? '-',
                          label: l10n.hospitalDetailBeds,
                        ),
                        InfoStat(
                          icon: Icons.flight_land_outlined,
                          value: h.airportDistanceKm == null
                              ? '-'
                              : l10n.hospitalDetailDistanceKm(h.airportDistanceKm!.toStringAsFixed(0)),
                          label: l10n.hospitalDetailFromAirport,
                        ),
                      ],
                    ),
                  ),
                  if (h.startingPriceMinor != null) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Text(l10n.hospitalDetailTreatmentsFrom, style: context.text.bodyMedium),
                        ApproxPrice(
                          h.startingPriceMinor!,
                          h.currency,
                          style: context.text.titleMedium?.copyWith(color: AppColors.primary),
                        ),
                      ],
                    ),
                  ],
                  if ((h.description ?? '').isNotEmpty)
                    DetailSection(title: l10n.catalogAboutSection, child: ExpandableText(h.description!)),
                  if (h.specialties.isNotEmpty)
                    DetailSection(
                      title: l10n.hospitalDetailSpecialties,
                      child: PillWrap(h.specialties, icon: Icons.medical_services_outlined),
                    ),
                  if (h.languages.isNotEmpty)
                    DetailSection(
                      title: l10n.catalogLanguagesSpoken,
                      child: PillWrap(h.languages, icon: Icons.translate_rounded),
                    ),
                  DetailSection(
                    title: l10n.availabilitySection,
                    child: AvailabilityPreview(id: h.id, doctor: false),
                  ),
                  if (h.procedures.isNotEmpty)
                    DetailSection(
                      title: l10n.catalogTreatmentsPrices,
                      child: Column(
                        children: [
                          for (final p in h.procedures)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: HospitalProcedureCard(item: p),
                            ),
                          Text(l10n.hospitalDetailPricesIndicative, style: context.text.labelSmall),
                        ],
                      ),
                    ),
                  if (h.doctors.isNotEmpty)
                    DetailSection(
                      title: l10n.hospitalDetailDoctors,
                      child: Column(
                        children: [
                          for (final d in h.doctors)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: DoctorListTile(doctor: d, onTap: () => context.push(Routes.doctor(d.id))),
                            ),
                        ],
                      ),
                    ),
                  if (h.reviews.isNotEmpty)
                    DetailSection(
                      title: l10n.hospitalDetailPatientReviews,
                      child: Column(
                        children: [
                          for (final r in h.reviews.take(5))
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: ReviewTile(review: r),
                            ),
                        ],
                      ),
                    ),
                  DetailSection(
                    title: l10n.hospitalDetailContact,
                    child: _Contact(hospital: h),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Contact extends StatelessWidget {
  const _Contact({required this.hospital});

  final HospitalDetail hospital;

  @override
  Widget build(BuildContext context) {
    final h = hospital;
    final website = h.website;
    Uri? websiteUri;
    if (website != null && website.isNotEmpty) {
      websiteUri = Uri.tryParse(website.startsWith('http') ? website : 'https://$website');
    }
    final rows = <Widget>[
      if ((h.address ?? '').isNotEmpty)
        ContactRow(
          icon: Icons.map_outlined,
          label: h.address!,
          uri: h.lat != null && h.lng != null
              ? Uri.https('www.openstreetmap.org', '/', {'mlat': '${h.lat}', 'mlon': '${h.lng}', 'zoom': '16'})
              : Uri.https('www.openstreetmap.org', '/search', {'query': '${h.name} ${h.address}'}),
        ),
      if ((h.phone ?? '').isNotEmpty)
        ContactRow(
          icon: Icons.call_outlined,
          label: h.phone!,
          uri: Uri(scheme: 'tel', path: h.phone),
        ),
      if ((h.email ?? '').isNotEmpty)
        ContactRow(
          icon: Icons.mail_outline_rounded,
          label: h.email!,
          uri: Uri(scheme: 'mailto', path: h.email),
        ),
      if (websiteUri != null) ContactRow(icon: Icons.language_rounded, label: website!, uri: websiteUri),
    ];
    if (rows.isEmpty) {
      return Text(context.l10n.hospitalDetailContactViaCoordinator, style: context.text.bodySmall);
    }
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Column(children: rows),
    );
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(gradient: AppColors.heroGradient),
      child: Center(child: Icon(Icons.local_hospital_rounded, size: 72, color: Colors.white54)),
    );
  }
}
