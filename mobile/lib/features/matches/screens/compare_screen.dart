import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/screening_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../providers/match_view.dart';
import '../widgets/consultation_request.dart';
import 'match_detail_screen.dart';

/// Side-by-side comparison of up to 3 matches.
///
/// Route: `/compare?screening=&matches=a,b,c` · Owner: fl-screening.
class CompareScreen extends ConsumerWidget {
  const CompareScreen({super.key, this.screeningId, this.matchIds = const []});

  final String? screeningId;

  final List<String> matchIds;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = screeningId;
    final l10n = context.l10n;
    if (id == null || id.isEmpty || matchIds.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.compareTitleShort)),
        body: EmptyView(
          icon: Icons.compare_arrows_rounded,
          title: l10n.compareNothingTitle,
          message: l10n.compareNothingMessage,
          actionLabel: l10n.compareStartScreening,
          onAction: () => context.go(Routes.screeningNew),
        ),
      );
    }
    final matches = ref.watch(screeningMatchesProvider(id));
    final screening = ref.watch(screeningProvider(id)).value;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.compareTitle)),
      body: AsyncValueView<List<ScreeningMatch>>(
        value: matches,
        onRetry: () => ref.invalidate(screeningMatchesProvider(id)),
        data: (all) {
          final byId = {for (final m in all) m.id: m};
          final picked = [
            for (final mid in matchIds.take(kMaxCompare))
              if (byId[mid] != null) byId[mid]!,
          ];
          if (picked.isEmpty) {
            return EmptyView(
              icon: Icons.search_off_rounded,
              title: l10n.compareNoLongerAvailable,
              actionLabel: l10n.compareBackToMatches,
              onAction: () => context.go(Routes.matches(id)),
            );
          }
          return _CompareTable(matches: picked, screeningId: id, screening: screening);
        },
      ),
    );
  }
}

class _CompareTable extends StatelessWidget {
  const _CompareTable({required this.matches, required this.screeningId, this.screening});

  final List<ScreeningMatch> matches;
  final String screeningId;
  final Screening? screening;

  @override
  Widget build(BuildContext context) {
    final lowest = matches.map((m) => m.estimatedCostMinor).reduce((a, b) => a < b ? a : b);
    final best = matches.map((m) => m.matchScore).reduce((a, b) => a > b ? a : b);
    final sameCurrency = matches.map((m) => m.currency).toSet().length == 1;
    final l10n = context.l10n;

    TableRow row(String label, Widget Function(ScreeningMatch m) cell, {bool shaded = false}) => TableRow(
      decoration: BoxDecoration(color: shaded ? context.palette.surfaceAlt.withValues(alpha: 0.5) : null),
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(12, 12, 8, 12),
          child: Text(
            label,
            style: context.text.labelMedium?.copyWith(
              color: context.palette.textSecondary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        for (final m in matches) Padding(padding: const EdgeInsets.all(12), child: cell(m)),
      ],
    );

    Widget text(String? v, {TextStyle? style}) =>
        Text(v == null || v.isEmpty ? '-' : v, style: style ?? context.text.bodySmall);

    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 24),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Table(
          defaultVerticalAlignment: TableCellVerticalAlignment.top,
          columnWidths: {
            0: const FixedColumnWidth(110),
            for (var i = 1; i <= matches.length; i++) i: const FixedColumnWidth(170),
          },
          border: TableBorder(
            horizontalInside: BorderSide(color: context.palette.border.withValues(alpha: 0.6)),
            verticalInside: BorderSide(color: context.palette.border.withValues(alpha: 0.6)),
          ),
          children: [
            TableRow(
              children: [
                const SizedBox.shrink(),
                for (final m in matches)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      children: [
                        Avatar(
                          imageUrl: m.doctor?.photoUrl ?? m.hospital.logoUrl,
                          name: m.doctor?.fullName ?? m.hospital.name,
                          size: 64,
                          square: true,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          m.doctor?.fullName ?? m.hospital.name,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            row(
              l10n.compareRowMatch,
              (m) => StatusBadge(
                label: m.matchLabel,
                color: m.matchScore == best ? AppColors.primary : AppColors.info,
                dense: true,
              ),
              shaded: true,
            ),
            row(
              l10n.filtersSpecialtyLabel,
              (m) => text(m.doctor?.specialty?.name ?? m.hospital.specialties.take(2).join(', ')),
            ),
            row(
              l10n.doctorDetailExperience,
              (m) => text(
                m.doctor?.experienceYears == null ? null : l10n.compareExperienceYears(m.doctor!.experienceYears!),
              ),
              shaded: true,
            ),
            row(
              l10n.doctorDetailSuccessRate,
              (m) => text(
                m.doctor?.successRatePct == null ? null : l10n.catalogPercent(m.doctor!.successRatePct!.round()),
              ),
            ),
            row(l10n.compareRowRating, (m) {
              final r = m.doctor?.ratingAvg ?? m.hospital.ratingAvg;
              final c = m.doctor?.ratingCount ?? m.hospital.ratingCount;
              return r == null ? text(null) : text('★ ${r.toStringAsFixed(1)} ($c)');
            }, shaded: true),
            row(
              l10n.compareRowHospital,
              (m) => text([m.hospital.name, m.hospital.city].whereType<String>().join(', ')),
            ),
            row(
              l10n.compareRowAccreditation,
              (m) => text(m.hospital.accreditations.map((a) => a.toUpperCase()).join(', ')),
              shaded: true,
            ),
            row(
              l10n.compareRowLanguages,
              (m) => text({...?m.doctor?.languages, ...m.hospital.languages}.take(5).join(', ')),
            ),
            row(l10n.compareRowEstCost, (m) {
              final isLowest = sameCurrency && m.estimatedCostMinor == lowest && matches.length > 1;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  MoneyText(
                    m.estimatedCostMinor,
                    m.currency,
                    style: context.text.titleSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                      color: isLowest ? AppColors.primary : AppColors.danger,
                    ),
                  ),
                  if (isLowest)
                    Text(l10n.compareLowest, style: context.text.labelSmall?.copyWith(color: AppColors.primary)),
                ],
              );
            }, shaded: true),
            row(
              l10n.compareRowSavings,
              (m) => text(
                m.savings == null ? null : l10n.comparePercentRange(m.savings!.pctMin, m.savings!.pctMax),
                style: context.text.bodySmall?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
              ),
            ),
            row(l10n.compareRowPackage, (m) => text(m.package?.name), shaded: true),
            row(
              l10n.catalogVideoConsult,
              (m) => text((m.doctor?.teleconsultAvailable ?? false) ? l10n.commonYes : l10n.commonNo),
            ),
            row(l10n.compareRowWhy, (m) => text(m.reasons.take(3).join('\n')), shaded: true),
            TableRow(
              children: [
                const SizedBox.shrink(),
                for (final m in matches)
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Column(
                      children: [
                        PrimaryButton(
                          label: l10n.compareBook,
                          tone: ButtonTone.red,
                          onPressed: () => requestConsultation(
                            context,
                            match: m,
                            screeningId: screeningId,
                            specialtyId: screening?.specialty?.id,
                          ),
                        ),
                        const SizedBox(height: 8),
                        SecondaryButton(
                          label: l10n.compareDetails,
                          onPressed: () => Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) =>
                                  MatchDetailScreen(match: m, screeningId: screeningId, screening: screening),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
