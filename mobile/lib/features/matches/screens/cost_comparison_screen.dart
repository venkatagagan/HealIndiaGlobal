import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/screening_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../providers/match_view.dart';
import '../widgets/consultation_request.dart';

/// Procedures for the treatment picker (when no procedure is known).
final _procedureOptionsProvider = FutureProvider.autoDispose.family<List<Procedure>, String?>(
  (ref, specialty) => ref.watch(catalogRepositoryProvider).procedures(specialty: specialty),
);

/// Home countries offered in the "Compare with" picker.
const List<String> kComparisonCountries = ['US', 'GB', 'CA', 'AU', 'AE', 'SA', 'OM', 'QA', 'KW', 'NG', 'KE', 'BD'];

/// Treatment Comparison home country vs India + itemized breakdown + Book Consultation (creates a case).
///
/// Route: `/cost-comparison?procedure=&country=&currency=&screening=&match=` · Owner: fl-screening.
class CostComparisonScreen extends ConsumerStatefulWidget {
  const CostComparisonScreen({
    super.key,
    this.procedureSlug,
    this.country,
    this.currency,
    this.screeningId,
    this.matchId,
  });

  final String? procedureSlug;

  final String? country;

  final String? currency;

  final String? screeningId;

  final String? matchId;

  @override
  ConsumerState<CostComparisonScreen> createState() => _CostComparisonScreenState();
}

class _CostComparisonScreenState extends ConsumerState<CostComparisonScreen> {
  String? _pickedProcedure;
  String? _pickedCountry;

  @override
  Widget build(BuildContext context) {
    final sid = widget.screeningId;
    final screeningAsync = sid == null ? null : ref.watch(screeningProvider(sid));
    final matchesAsync = sid == null || widget.matchId == null ? null : ref.watch(screeningMatchesProvider(sid));
    final screening = screeningAsync?.value;
    final match = matchesAsync?.value?.where((m) => m.id == widget.matchId).firstOrNull;

    final procedure =
        _pickedProcedure ??
        widget.procedureSlug ??
        match?.procedure?.slug ??
        screening?.aiResult?.recommendedProcedures.firstOrNull?.slug;
    final country =
        (_pickedCountry ??
                widget.country ??
                match?.savings?.homeCountry ??
                screening?.homeCountry ??
                ref.watch(currentUserProvider)?.countryCode ??
                'US')
            .toUpperCase();
    final String localCurrency = ref.watch(preferredCurrencyProvider);
    final currency = (widget.currency ?? match?.currency ?? localCurrency).toUpperCase();

    final waitingForContext =
        procedure == null && ((screeningAsync?.isLoading ?? false) || (matchesAsync?.isLoading ?? false));

    return Scaffold(
      appBar: AppBar(
        title: Text(context.l10n.costTitle, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
      ),
      body: waitingForContext
          ? const LoadingView()
          : procedure == null
          ? _ProcedurePicker(
              specialty: screening?.specialty?.slug,
              onPicked: (slug) => setState(() => _pickedProcedure = slug),
            )
          : _Comparison(
              args: (procedure: procedure, country: country, currency: currency),
              onCountry: (c) => setState(() => _pickedCountry = c),
            ),
      bottomNavigationBar: procedure == null
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: PrimaryButton(
                  label: match != null ? context.l10n.consultationBookTitle : context.l10n.costFindHospitals,
                  icon: match != null ? Icons.event_available_rounded : Icons.search_rounded,
                  onPressed: () {
                    if (match != null) {
                      requestConsultation(
                        context,
                        match: match,
                        screeningId: sid,
                        specialtyId: screening?.specialty?.id,
                      );
                    } else if (sid != null) {
                      context.go(Routes.matches(sid));
                    } else {
                      context.push(Routes.searchFor(q: procedure.replaceAll('-', ' ')));
                    }
                  },
                ),
              ),
            ),
    );
  }
}

class _Comparison extends ConsumerWidget {
  const _Comparison({required this.args, required this.onCountry});

  final CostComparisonArgs args;
  final ValueChanged<String> onCountry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(costComparisonProvider(args));
    final l10n = context.l10n;
    return AsyncValueView<CostComparison>(
      value: data,
      onRetry: () => ref.invalidate(costComparisonProvider(args)),
      data: (c) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          const BrandHeader(padding: EdgeInsets.fromLTRB(0, 8, 0, 4)),
          Text(
            c.procedure.name,
            textAlign: TextAlign.center,
            style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Center(
            child: PopupMenuButton<String>(
              tooltip: l10n.costChangeCountryTooltip,
              onSelected: onCountry,
              itemBuilder: (_) => [
                for (final code in kComparisonCountries)
                  PopupMenuItem(value: code, child: Text(countryName(code, l10n))),
              ],
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      l10n.costCompareWith(countryName(c.home.countryCode ?? args.country, l10n)),
                      style: context.text.labelLarge?.copyWith(color: AppColors.info),
                    ),
                    const Icon(Icons.arrow_drop_down_rounded, color: AppColors.info),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _SideCard(
                    title: l10n.costTreatmentIn(countryName(c.home.countryCode ?? args.country, l10n)),
                    rows: [
                      (l10n.costRowCost, formatMoneyRange(c.home.minMinor, c.home.maxMinor, c.home.currency), null),
                      (l10n.costRowWaitTime, c.home.waitTimeText ?? l10n.costVaries, null),
                      (l10n.costRowInsurance, l10n.costVariesByPlan, null),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _SideCard(
                    title: l10n.costTreatmentInIndia,
                    highlighted: true,
                    rows: [
                      (l10n.costRowCost, formatMoneyRange(c.india.minMinor, c.india.maxMinor, c.india.currency), null),
                      (l10n.costRowWaitTime, c.india.waitTimeText ?? l10n.costIndiaDefaultWait, null),
                      (
                        l10n.compareRowSavings,
                        l10n.costSavingsValue(
                          formatMoneyRange(c.savings.minMinor, c.savings.maxMinor, c.savings.currency),
                          c.savings.pctMin,
                          c.savings.pctMax,
                        ),
                        AppColors.primary,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text(l10n.costItemizedTitle, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          ..._itemRows(context, c),
          const SizedBox(height: 12),
          Text(l10n.costDisclaimer, style: context.text.labelSmall?.copyWith(color: context.palette.textMuted)),
        ],
      ),
    );
  }

  List<Widget> _itemRows(BuildContext context, CostComparison c) {
    const order = ['surgery', 'hospital_stay', 'medications', 'tests_scans', 'doctor_fees', 'implants', 'other'];
    final items = [...c.itemized]
      ..sort((a, b) {
        final ia = order.indexOf(a.category);
        final ib = order.indexOf(b.category);
        return (ia < 0 ? 99 : ia).compareTo(ib < 0 ? 99 : ib);
      });
    final l10n = context.l10n;
    if (items.isEmpty) {
      return [
        AppCard(
          child: Text(
            l10n.costBreakdownInQuote,
            style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
          ),
        ),
      ];
    }
    // Home-country equivalent per line, scaled by the midpoint ratio (only when currencies match).
    final indiaMid = (c.india.minMinor + c.india.maxMinor) / 2;
    final homeMid = (c.home.minMinor + c.home.maxMinor) / 2;
    final ratio = indiaMid > 0 && c.home.currency == c.india.currency ? homeMid / indiaMid : null;
    return [
      for (final i in items)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: AppCard(
            padding: EdgeInsets.zero,
            child: Theme(
              data: context.theme.copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                key: PageStorageKey('cost-${i.category}'),
                shape: const Border(),
                title: Text(
                  costCategoryLabel(i.category, l10n),
                  style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                expandedCrossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    costCategoryHint(i.category, l10n),
                    style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(child: Text(countryName('IN', l10n), style: context.text.bodyMedium)),
                      MoneyText(
                        i.amountMinor,
                        i.currency,
                        style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.primary),
                      ),
                    ],
                  ),
                  if (ratio != null) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            l10n.costTypicalIn(countryName(c.home.countryCode, l10n)),
                            style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
                          ),
                        ),
                        MoneyText(
                          (i.amountMinor * ratio).round(),
                          c.home.currency,
                          style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
    ];
  }
}

class _SideCard extends StatelessWidget {
  const _SideCard({required this.title, required this.rows, this.highlighted = false});

  final String title;
  final List<(String, String, Color?)> rows;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      selected: highlighted,
      selectedColor: AppColors.primary,
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          for (final (label, value, color) in rows) ...[
            const SizedBox(height: 10),
            Text(label, style: context.text.labelSmall?.copyWith(color: color ?? context.palette.textSecondary)),
            const SizedBox(height: 2),
            Text(
              value,
              style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w800, color: color),
            ),
          ],
        ],
      ),
    );
  }
}

class _ProcedurePicker extends ConsumerStatefulWidget {
  const _ProcedurePicker({required this.specialty, required this.onPicked});

  final String? specialty;
  final ValueChanged<String> onPicked;

  @override
  ConsumerState<_ProcedurePicker> createState() => _ProcedurePickerState();
}

class _ProcedurePickerState extends ConsumerState<_ProcedurePicker> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final options = ref.watch(_procedureOptionsProvider(widget.specialty));
    final l10n = context.l10n;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.costChooseTreatment, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(
                l10n.costChooseTreatmentSubtitle,
                style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
              ),
              const SizedBox(height: 12),
              TextField(
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search_rounded),
                  hintText: l10n.costSearchTreatments,
                ),
                onChanged: (v) => setState(() => _q = v.trim().toLowerCase()),
              ),
            ],
          ),
        ),
        Expanded(
          child: AsyncValueView<List<Procedure>>(
            value: options,
            onRetry: () => ref.invalidate(_procedureOptionsProvider(widget.specialty)),
            data: (items) {
              final list = items.where((p) => _q.isEmpty || p.name.toLowerCase().contains(_q)).toList();
              if (list.isEmpty) return EmptyView(title: l10n.costNoTreatmentsFound, icon: Icons.search_off_rounded);
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final p = list[i];
                  return AppCard(
                    onTap: () => widget.onPicked(p.slug),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(p.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                              if (p.specialty != null)
                                Text(
                                  p.specialty!.name,
                                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                                ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right_rounded),
                      ],
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
