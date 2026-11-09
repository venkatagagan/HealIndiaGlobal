import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../providers/match_view.dart';
import '../widgets/consultation_request.dart';

/// Match detail (pushed from the matches list): doctor & hospital, why it matched, estimated cost and
/// savings, package, doctor bio and procedures/packages, with Compare Costs and Book Consultation.
class MatchDetailScreen extends ConsumerWidget {
  const MatchDetailScreen({super.key, required this.match, required this.screeningId, this.screening});

  final ScreeningMatch match;
  final String screeningId;
  final Screening? screening;

  void _openCostComparison(BuildContext context) {
    final procedure = match.procedure?.slug ?? screening?.aiResult?.recommendedProcedures.firstOrNull?.slug;
    context.push(
      Routes.costComparisonFor(
        procedure: procedure,
        country: match.savings?.homeCountry ?? screening?.homeCountry,
        currency: match.currency,
        screeningId: screeningId,
        matchId: match.id,
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final m = match;
    final doctor = m.doctor;
    final hospital = m.hospital;
    final title = doctor?.fullName ?? hospital.name;
    final detail = doctor == null ? null : ref.watch(doctorDetailProvider(doctor.id));
    final l10n = context.l10n;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            pinned: true,
            expandedHeight: 220,
            title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
            flexibleSpace: FlexibleSpaceBar(
              background: Row(
                children: [
                  Expanded(
                    child: _Image(url: doctor?.photoUrl ?? hospital.logoUrl, name: title),
                  ),
                  Expanded(
                    child: _Image(url: hospital.coverImageUrl, name: hospital.name, cover: true),
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
                  children: [
                    Expanded(
                      child: Text(title, style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                    ),
                    StatusBadge(label: m.matchLabel, color: AppColors.primary),
                  ],
                ),
                if (doctor != null && doctor.subtitle.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(doctor.subtitle, style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary)),
                ],
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (doctor?.successRatePct != null)
                      StatusBadge(
                        label: l10n.catalogSuccessBadge(doctor!.successRatePct!.round()),
                        color: const Color(0xFF60A5FA),
                        icon: Icons.verified_outlined,
                      ),
                    for (final a in hospital.accreditations)
                      StatusBadge(label: a.toUpperCase(), color: AppColors.violet),
                    if (doctor?.teleconsultAvailable ?? false)
                      StatusBadge(
                        label: l10n.catalogVideoConsult,
                        color: AppColors.cyan,
                        icon: Icons.videocam_outlined,
                      ),
                  ],
                ),
                if ((doctor?.ratingAvg ?? hospital.ratingAvg) != null) ...[
                  const SizedBox(height: 12),
                  RatingStars(
                    rating: doctor?.ratingAvg ?? hospital.ratingAvg!,
                    count: doctor?.ratingCount ?? hospital.ratingCount,
                  ),
                ],
                if (m.reasons.isNotEmpty) ...[
                  SectionTitle(l10n.matchDetailWhyThisMatch),
                  AppCard(
                    child: Column(
                      children: [
                        for (final r in m.reasons)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              children: [
                                const Icon(Icons.check_circle_rounded, color: AppColors.primary, size: 18),
                                const SizedBox(width: 10),
                                Expanded(child: Text(r, style: context.text.bodyMedium)),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                SectionTitle(l10n.matchDetailEstimatedCost),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (m.procedure != null)
                        Text(m.procedure!.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                      MoneyText(
                        m.estimatedCostMinor,
                        m.currency,
                        style: context.text.headlineMedium?.copyWith(
                          color: AppColors.danger,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      if (m.savings != null) ...[
                        const SizedBox(height: 6),
                        Text.rich(
                          TextSpan(
                            text: l10n.matchDetailInCountry(countryName(m.savings!.homeCountry, l10n)),
                            children: [
                              TextSpan(
                                text: formatMoneyRange(
                                  m.savings!.homeMinMinor,
                                  m.savings!.homeMaxMinor,
                                  m.savings!.homeCurrency,
                                ),
                              ),
                              TextSpan(
                                text: '  ·  ${l10n.matchDetailSavePct(m.savings!.pctMin, m.savings!.pctMax)}',
                                style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                          style: context.text.bodySmall,
                        ),
                      ],
                      const SizedBox(height: 8),
                      Text(
                        l10n.matchDetailFinalPriceNote,
                        style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
                      ),
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: TextButton.icon(
                          onPressed: () => _openCostComparison(context),
                          icon: const Icon(Icons.compare_arrows_rounded),
                          label: Text(l10n.matchDetailSeeFullComparison),
                        ),
                      ),
                    ],
                  ),
                ),
                if (m.package != null) ...[
                  SectionTitle(l10n.matchDetailSuggestedPackage),
                  _PackageCard(package: m.package!),
                ],
                SectionTitle(l10n.compareRowHospital),
                AppCard(
                  onTap: () => context.push(Routes.hospital(hospital.slug.isNotEmpty ? hospital.slug : hospital.id)),
                  child: Row(
                    children: [
                      Avatar(imageUrl: hospital.logoUrl, name: hospital.name, square: true, size: 48),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(hospital.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                            if (hospital.location.isNotEmpty)
                              Text(
                                hospital.location,
                                style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                              ),
                            if (hospital.internationalDesk)
                              Text(
                                l10n.catalogInternationalPatientDesk,
                                style: context.text.labelSmall?.copyWith(color: AppColors.primary),
                              ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right_rounded),
                    ],
                  ),
                ),
                if (detail != null)
                  detail.when(
                    loading: () => const Padding(padding: EdgeInsets.all(24), child: LoadingView()),
                    error: (e, _) => ErrorView(
                      error: e,
                      compact: true,
                      onRetry: () => ref.invalidate(doctorDetailProvider(doctor!.id)),
                    ),
                    data: (d) => _DoctorDetailSection(detail: d),
                  ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: SecondaryButton(
                  label: l10n.matchDetailCompareCosts,
                  filled: true,
                  onPressed: () => _openCostComparison(context),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: PrimaryButton(
                  label: l10n.consultationBookTitle,
                  tone: ButtonTone.red,
                  onPressed: () => requestConsultation(
                    context,
                    match: m,
                    screeningId: screeningId,
                    specialtyId: screening?.specialty?.id,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DoctorDetailSection extends StatelessWidget {
  const _DoctorDetailSection({required this.detail});

  final DoctorDetail detail;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (detail.bio?.trim().isNotEmpty ?? false) ...[
          SectionTitle(l10n.catalogAboutSection),
          Text(detail.bio!, style: context.text.bodyMedium),
        ],
        if (detail.subSpecialties.isNotEmpty || detail.languages.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final s in detail.subSpecialties) StatusBadge(label: s, color: AppColors.info, dense: true),
              for (final l in detail.languages)
                StatusBadge(label: l, color: AppColors.cyan, icon: Icons.translate_rounded, dense: true),
            ],
          ),
        ],
        if (detail.nextAvailableDate != null) ...[
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(Icons.event_available_rounded, color: AppColors.primary, size: 18),
              const SizedBox(width: 8),
              Text(l10n.availabilityNextAvailable(Dates.day(detail.nextAvailableDate)), style: context.text.bodyMedium),
            ],
          ),
        ],
        if (detail.procedures.isNotEmpty) ...[
          SectionTitle(l10n.matchDetailProceduresPackages),
          for (final p in detail.procedures)
            AppCard(
              margin: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(p.procedure.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  MoneyText(
                    p.priceMinMinor,
                    p.currency,
                    maxMinor: p.priceMaxMinor,
                    style: context.text.bodyMedium?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
                  ),
                  if (p.hospitalStayDays != null)
                    Text(
                      l10n.catalogDaysInHospital(p.hospitalStayDays!),
                      style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                    ),
                  for (final pkg in p.packages)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: _PackageCard(package: pkg, dense: true),
                    ),
                ],
              ),
            ),
        ],
      ],
    );
  }
}

class _PackageCard extends StatelessWidget {
  const _PackageCard({required this.package, this.dense = false});

  final TreatmentPackage package;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      color: dense ? context.palette.surfaceAlt : null,
      padding: EdgeInsets.all(dense ? 12 : 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(package.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
              ),
              StatusBadge(label: package.tier.label, color: AppColors.violet, dense: true),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              MoneyText(
                package.priceMinor,
                package.currency,
                style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
              if (package.originalPriceMinor != null && package.savingsMinor > 0) ...[
                const SizedBox(width: 8),
                MoneyText(
                  package.originalPriceMinor!,
                  package.currency,
                  strikethrough: true,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
                ),
              ],
            ],
          ),
          if (package.includes.bullets.isNotEmpty) ...[
            const SizedBox(height: 6),
            for (final b in package.includes.bullets)
              Text('•  $b', style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
          ],
        ],
      ),
    );
  }
}

class _Image extends StatelessWidget {
  const _Image({required this.url, required this.name, this.cover = false});

  final String? url;
  final String name;
  final bool cover;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      color: cover ? const Color(0xFFF1F5F9) : const Color(0xFF3FA7A3),
      alignment: Alignment.center,
      child: cover
          ? const Icon(Icons.local_hospital_outlined, size: 40, color: Color(0xFF94A3B8))
          : Text(
              initialsOf(name),
              style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w800, color: Colors.white),
            ),
    );
    if (url == null || url!.isEmpty) return Semantics(image: true, label: name, child: fallback);
    return Semantics(
      image: true,
      label: name,
      child: CachedNetworkImage(
        imageUrl: url!,
        fit: BoxFit.cover,
        placeholder: (_, _) => fallback,
        errorWidget: (_, _, _) => fallback,
      ),
    );
  }
}
