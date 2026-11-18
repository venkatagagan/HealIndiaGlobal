import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../widgets/catalog_cards.dart';
import '../widgets/request_quote_sheet.dart';

/// Hospitals offering a procedure, ordered by the earliest free admission day (then price). Pick up to
/// three and request quotes in one go.
///
/// Route: `/procedures/:slug/earliest`.
class ProcedureEarliestScreen extends ConsumerStatefulWidget {
  const ProcedureEarliestScreen({super.key, required this.slug});

  final String slug;

  @override
  ConsumerState<ProcedureEarliestScreen> createState() => _ProcedureEarliestScreenState();
}

class _ProcedureEarliestScreenState extends ConsumerState<ProcedureEarliestScreen> {
  final Set<String> _selected = {};
  bool _preselected = false;

  void _toggle(String id) {
    setState(() {
      if (_selected.contains(id)) {
        _selected.remove(id);
      } else if (_selected.length < CaseRepository.maxQuoteHospitals) {
        _selected.add(id);
      } else {
        showInfoSnack(context, context.l10n.quickQuoteMaxHospitals(CaseRepository.maxQuoteHospitals));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final value = ref.watch(procedureEarliestProvider(widget.slug));
    final data = value.value;
    if (data != null && !_preselected && data.items.isNotEmpty) {
      // The earliest hospital is preselected so one tap requests a quote.
      _preselected = true;
      _selected.add(data.items.first.hospital.id);
    }
    return Scaffold(
      appBar: AppBar(title: Text(data?.procedure.name ?? l10n.earliestScreenTitle)),
      bottomNavigationBar: data == null || data.items.isEmpty
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: PrimaryButton(
                key: const ValueKey('earliest-request-quotes'),
                label: l10n.quickQuoteRequestFrom(_selected.length),
                icon: Icons.request_quote_outlined,
                onPressed: _selected.isEmpty
                    ? null
                    : () => openQuickQuote(
                        context,
                        ref,
                        hospitalIds: [
                          for (final i in data.items)
                            if (_selected.contains(i.hospital.id)) i.hospital.id,
                        ],
                        procedureSlug: widget.slug,
                      ),
              ),
            ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(procedureEarliestProvider(widget.slug).future),
        child: AsyncValueView<ProcedureEarliest>(
          value: value,
          onRetry: () => ref.invalidate(procedureEarliestProvider(widget.slug)),
          data: (d) => d.items.isEmpty
              ? ListView(
                  children: [
                    EmptyView(
                      icon: Icons.event_busy_outlined,
                      title: l10n.earliestEmptyTitle,
                      message: l10n.earliestEmptyMessage,
                      actionLabel: l10n.homeSearchButton,
                      onAction: () => context.go(Routes.searchFor(q: d.procedure.name)),
                    ),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: [
                    Text(l10n.earliestIntro, style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary)),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton.icon(
                        icon: const Icon(Icons.compare_arrows_rounded),
                        label: Text(l10n.earliestCompareCosts),
                        onPressed: () => context.push(Routes.costComparisonFor(procedure: widget.slug)),
                      ),
                    ),
                    for (final item in d.items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _EarliestTile(
                          item: item,
                          selected: _selected.contains(item.hospital.id),
                          onToggle: () => _toggle(item.hospital.id),
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _EarliestTile extends StatelessWidget {
  const _EarliestTile({required this.item, required this.selected, required this.onToggle});

  final ProcedureEarliestItem item;
  final bool selected;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final h = item.hospital;
    return AppCard(
      key: ValueKey('earliest-${h.id}'),
      selected: selected,
      onTap: () => context.push(Routes.hospital(h.slug.isNotEmpty ? h.slug : h.id)),
      padding: const EdgeInsetsDirectional.fromSTEB(12, 12, 4, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          HospitalImage(url: h.logoUrl ?? h.coverImageUrl, size: 56),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(h.name, style: context.text.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                if (h.location.isNotEmpty) Text(h.location, style: context.text.bodySmall),
                const SizedBox(height: 6),
                if (item.nextAvailableAdmission == null && item.nextAvailableConsultation == null)
                  Text(l10n.earliestAskCoordinator, style: context.text.labelSmall)
                else
                  EarliestDates(
                    consultation: item.nextAvailableConsultation,
                    admission: item.nextAvailableAdmission,
                  ),
                if (h.accreditations.isNotEmpty || h.accreditationsVerified.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  AccreditationBadges(h.accreditations, verified: h.accreditationsVerified),
                ],
                if (item.priceMinMinor != null) ...[
                  const SizedBox(height: 6),
                  ApproxPrice(
                    item.priceMinMinor!,
                    item.currency,
                    maxMinor: item.priceMaxMinor,
                    display: item.displayPriceMin,
                    displayMax: item.displayPriceMax,
                    style: context.text.labelLarge?.copyWith(color: AppColors.primary),
                  ),
                ],
              ],
            ),
          ),
          Semantics(
            label: l10n.earliestSelectSemantics(h.name),
            checked: selected,
            child: Checkbox(value: selected, onChanged: (_) => onToggle()),
          ),
        ],
      ),
    );
  }
}
