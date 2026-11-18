import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../profile/data/countries.dart';
import '../../profile/widgets/country_picker_sheet.dart';

/// Cards shown before "Show more".
const _collapsedCount = 3;

/// Home "Your country vs India": procedure, home vs India price range, saving %, wait at home vs the
/// earliest India date, and the estimate's source.
///
/// Display rule (legal): a price comparison / saving is shown only when the benchmark's confidence is
/// medium or high AND India is cheaper ([canShowSaving]); otherwise the card leads with the wait time /
/// earliest date and makes no saving claim. Tapping a card opens the hospitals with the earliest dates.
class CostHighlightsBlock extends ConsumerStatefulWidget {
  const CostHighlightsBlock({super.key});

  @override
  ConsumerState<CostHighlightsBlock> createState() => _CostHighlightsBlockState();
}

class _CostHighlightsBlockState extends ConsumerState<CostHighlightsBlock> {
  bool _expanded = false;

  Future<void> _changeCountry(String? current) async {
    final choice = await showCountryPicker(
      context,
      selected: ref.read(homeCountryProvider) ?? current,
      title: context.l10n.costHomeCountryPickerTitle,
      allowAuto: true,
    );
    if (choice == null) return;
    await ref.read(homeCountryProvider.notifier).set(choice.auto ? null : choice.code);
  }

  @override
  Widget build(BuildContext context) {
    final value = ref.watch(costHighlightsProvider);
    return value.when(
      // A failed or empty block never blocks the home screen: it simply is not shown.
      error: (_, _) => const SizedBox.shrink(),
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: LinearProgressIndicator(minHeight: 2),
      ),
      data: (h) => h.items.isEmpty ? const SizedBox.shrink() : _content(context, h),
    );
  }

  Widget _content(BuildContext context, CostHighlights h) {
    final l10n = context.l10n;
    final c = h.country;
    final shown = c.countryUsed;
    final items = _expanded ? h.items : h.items.take(_collapsedCount).toList();
    final subtitle = c.isFallback
        ? l10n.costHomeFallback(countryName(shown, l10n))
        : l10n.costHomePricesFor(countryName(shown, l10n));
    return Column(
      key: const ValueKey('cost-highlights'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(l10n.costHomeTitle, padding: const EdgeInsets.only(top: 16, bottom: 4)),
        Semantics(
          button: true,
          label: '$subtitle. ${l10n.costHomeChange}',
          excludeSemantics: true,
          child: InkWell(
            key: const ValueKey('cost-change-country'),
            borderRadius: BorderRadius.circular(AppRadius.sm),
            onTap: () => _changeCountry(c.requestedCountry ?? shown),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Row(
                children: [
                  Text(countryFlag(shown), style: const TextStyle(fontSize: 18)),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      subtitle,
                      style: context.text.bodySmall?.copyWith(
                        color: c.isFallback ? AppColors.warning : context.palette.textSecondary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    l10n.costHomeChange,
                    style: context.text.labelLarge?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        for (final item in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: CostHighlightCard(item: item, countryCode: shown),
          ),
        if (h.items.length > _collapsedCount)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              icon: Icon(_expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded),
              label: Text(_expanded ? l10n.costHomeShowLess : l10n.costHomeShowMore(h.items.length - _collapsedCount)),
              onPressed: () => setState(() => _expanded = !_expanded),
            ),
          ),
      ],
    );
  }
}

/// One procedure of the home comparison.
class CostHighlightCard extends StatelessWidget {
  const CostHighlightCard({super.key, required this.item, required this.countryCode});

  final CostHighlightItem item;
  final String countryCode;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final home = item.home;
    final india = item.india;
    final showSaving = item.showSaving;
    final country = countryName(countryCode, l10n);
    final slug = item.procedure.slug;
    final homeWait = (home.waitTimeText ?? '').trim();
    final indiaWhen = india.earliestAdmissionDate != null
        ? l10n.costHomeIndiaEarliest(EarliestDates.label(l10n, india.earliestAdmissionDate!))
        : ((india.waitTimeText ?? '').isNotEmpty ? l10n.costHomeIndiaWait(india.waitTimeText!) : null);

    return AppCard(
      key: ValueKey('cost-card-${item.procedure.id}'),
      onTap: slug == null ? null : () => context.push(Routes.procedureEarliest(slug)),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.procedure.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                    if (item.specialty != null)
                      Text(
                        item.specialty!.name,
                        style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
                      ),
                  ],
                ),
              ),
              if (showSaving)
                StatusBadge(
                  key: const ValueKey('cost-saving-badge'),
                  label: l10n.costHomeSave(_pct(item.savings)),
                  color: AppColors.primary,
                ),
            ],
          ),
          const SizedBox(height: 10),
          if (showSaving)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _PriceColumn(
                    label: l10n.costHomeInCountry(country),
                    text: formatMoneyRange(home.minMinor, home.maxMinor, home.currency, compact: true),
                    muted: true,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _PriceColumn(
                    label: l10n.costHomeInIndia,
                    text: formatMoneyRange(india.minMinor, india.maxMinor, india.currency, compact: true),
                  ),
                ),
              ],
            )
          else
            // No saving claim: lead with time-to-treatment.
            Text(
              key: const ValueKey('cost-time-lead'),
              homeWait.isEmpty ? l10n.costHomeOftenUnavailable : l10n.costHomeWaitAtHome(homeWait),
              style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            children: [
              if (showSaving && homeWait.isNotEmpty)
                _Fact(icon: Icons.hourglass_bottom_rounded, text: l10n.costHomeWaitAtHome(homeWait)),
              if (indiaWhen != null) _Fact(icon: Icons.event_available_rounded, text: indiaWhen, accent: true),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  key: const ValueKey('cost-source'),
                  style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    alignment: AlignmentDirectional.centerStart,
                    minimumSize: const Size(48, 40),
                  ),
                  onPressed: () => showCostSourceDialog(context, home, country),
                  child: Text(
                    home.hasSource ? l10n.costHomeEstimateSource(_sourceShort(home)) : l10n.costHomeEstimate,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.labelSmall?.copyWith(
                      color: context.palette.textSecondary,
                      decoration: TextDecoration.underline,
                    ),
                  ),
                ),
              ),
              Text(
                l10n.costHomeSeeHospitals,
                style: context.text.labelLarge?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
              ),
              const Icon(Icons.chevron_right_rounded, color: AppColors.primary),
            ],
          ),
        ],
      ),
    );
  }

  static String _pct(CostSavings s) => s.pctMin == s.pctMax ? '${s.pctMax}%' : '${s.pctMin}–${s.pctMax}%';

  static String _sourceShort(CostSide home) {
    final s = (home.source ?? '').trim();
    final base = s.isNotEmpty ? s : (Uri.tryParse(home.sourceUrl ?? '')?.host ?? '');
    return home.priceYear == null ? base : '$base ${home.priceYear}';
  }
}

class _PriceColumn extends StatelessWidget {
  const _PriceColumn({required this.label, required this.text, this.muted = false});

  final String label;
  final String text;
  final bool muted;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
      Text(
        text,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: context.text.titleMedium?.copyWith(
          fontWeight: FontWeight.w800,
          color: muted ? context.palette.textSecondary : AppColors.primary,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    ],
  );
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.text, this.accent = false});

  final IconData icon;
  final String text;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final color = accent ? AppColors.primary : context.palette.textSecondary;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 4),
        Flexible(child: Text(text, style: context.text.labelMedium?.copyWith(color: color))),
      ],
    );
  }
}

/// "About this estimate": source title, link, year, confidence and the wait-time source.
Future<void> showCostSourceDialog(BuildContext context, CostSide home, String country) {
  final l10n = context.l10n;
  final url = Uri.tryParse(home.sourceUrl ?? '');
  final hasUrl = url != null && (url.scheme == 'https' || url.scheme == 'http');
  final confidence = switch (home.confidence) {
    'high' => l10n.costConfidenceHigh,
    'medium' => l10n.costConfidenceMedium,
    'low' => l10n.costConfidenceLow,
    _ => null,
  };
  return showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(l10n.costSourceTitle),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.costSourceIntro(country), style: ctx.text.bodyMedium),
            const SizedBox(height: 12),
            if ((home.source ?? '').isNotEmpty) _line(ctx, l10n.costSourceLabel, home.source!),
            if (home.priceYear != null) _line(ctx, l10n.costSourceYear, '${home.priceYear}'),
            if (confidence != null) _line(ctx, l10n.costSourceConfidence, confidence),
            if ((home.waitSource ?? '').isNotEmpty) _line(ctx, l10n.costSourceWait, home.waitSource!),
            if (!home.hasSource) Text(l10n.costSourceNone, style: ctx.text.bodySmall),
            const SizedBox(height: 8),
            Text(
              l10n.costSourceDisclaimer,
              style: ctx.text.bodySmall?.copyWith(color: ctx.palette.textSecondary),
            ),
          ],
        ),
      ),
      actions: [
        if (hasUrl)
          TextButton.icon(
            icon: const Icon(Icons.open_in_new_rounded),
            label: Text(l10n.costSourceOpen),
            onPressed: () => launchUrl(url, mode: LaunchMode.externalApplication),
          ),
        TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(l10n.commonClose)),
      ],
    ),
  );
}

Widget _line(BuildContext context, String label, String value) => Padding(
  padding: const EdgeInsets.only(bottom: 6),
  child: Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(label, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
      Text(value, style: context.text.bodyMedium),
    ],
  ),
);
