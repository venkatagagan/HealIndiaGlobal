import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/network/realtime_service.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Width of one hospital column in the side-by-side comparison.
const double _columnWidth = 264;

/// The hospitals' quotes of one quick-quote request side by side, in the patient's currency, with the
/// cheapest highlighted and an Accept button per quote. Hospitals that have not answered show the live
/// countdown (or "overdue — we're chasing the hospital").
///
/// Route: `/quotes/:groupId`.
class QuoteGroupScreen extends ConsumerStatefulWidget {
  const QuoteGroupScreen({super.key, required this.groupId});

  final String groupId;

  @override
  ConsumerState<QuoteGroupScreen> createState() => _QuoteGroupScreenState();
}

class _QuoteGroupScreenState extends ConsumerState<QuoteGroupScreen> {
  String? _busyCaseId;

  Future<void> _accept(QuoteGroupCase c, Quote q) async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.caseAcceptQuote),
        content: Text(l10n.quoteGroupAcceptConfirm(c.hospital.name)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l10n.commonCancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l10n.caseAcceptQuote)),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busyCaseId = c.caseId);
    try {
      await ref.read(caseRepositoryProvider).acceptQuote(c.caseId, q.id);
      ref
        ..invalidate(quoteGroupProvider(widget.groupId))
        ..invalidate(casesProvider);
      if (mounted) await context.push(Routes.book(c.caseId, quoteId: q.id));
    } on Object catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busyCaseId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(realtimeEventsProvider, (_, next) {
      final type = next.value?.type;
      if (type == RealtimeEvents.caseUpdated) ref.invalidate(quoteGroupProvider(widget.groupId));
    });
    final l10n = context.l10n;
    final value = ref.watch(quoteGroupProvider(widget.groupId));
    return Scaffold(
      appBar: AppBar(title: Text(l10n.quoteGroupTitle)),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(quoteGroupProvider(widget.groupId).future),
        child: AsyncValueView<QuoteGroup>(
          value: value,
          onRetry: () => ref.invalidate(quoteGroupProvider(widget.groupId)),
          data: (g) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (g.title.isNotEmpty) Text(g.title, style: context.text.headlineSmall),
              const SizedBox(height: 4),
              Text(
                l10n.quoteGroupReplied(g.answered, g.cases.length),
                style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
              ),
              if (g.dueBy != null) ...[
                const SizedBox(height: 12),
                QuoteCountdown(
                  dueAt: g.dueBy!,
                  overdue: g.cases.where((c) => c.quote == null).every((c) => c.quoteOverdue),
                ),
              ],
              const SizedBox(height: 16),
              SingleChildScrollView(
                key: const ValueKey('quote-group-columns'),
                scrollDirection: Axis.horizontal,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final c in _ordered(g))
                      Padding(
                        padding: const EdgeInsetsDirectional.only(end: 12),
                        child: SizedBox(
                          width: _columnWidth,
                          child: _QuoteColumn(
                            group: g,
                            entry: c,
                            cheapest: c.caseId == g.cheapestCaseId,
                            busy: _busyCaseId == c.caseId,
                            onAccept: (q) => _accept(c, q),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Text(
                l10n.quoteGroupCurrencyNote(g.currency),
                style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Quoted hospitals first (cheapest first), then the ones still to answer.
  List<QuoteGroupCase> _ordered(QuoteGroup g) {
    final out = [...g.cases];
    out.sort((a, b) {
      final ta = a.totalInCurrencyMinor;
      final tb = b.totalInCurrencyMinor;
      if (ta != null && tb != null) return ta.compareTo(tb);
      if (ta != null) return -1;
      if (tb != null) return 1;
      return 0;
    });
    return out;
  }
}

class _QuoteColumn extends StatelessWidget {
  const _QuoteColumn({
    required this.group,
    required this.entry,
    required this.cheapest,
    required this.busy,
    required this.onAccept,
  });

  final QuoteGroup group;
  final QuoteGroupCase entry;
  final bool cheapest;
  final bool busy;
  final ValueChanged<Quote> onAccept;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = entry;
    final q = c.quote;
    final total = c.totalInCurrencyMinor;
    return AppCard(
      key: ValueKey('quote-column-${c.caseId}'),
      selected: cheapest && q != null,
      onTap: () => context.push(Routes.caseDetail(c.caseId)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (cheapest && q != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: StatusBadge(
                key: const ValueKey('quote-cheapest'),
                label: l10n.quoteGroupCheapest,
                color: AppColors.primary,
                icon: Icons.savings_outlined,
                dense: true,
              ),
            ),
          Text(c.hospital.name, style: context.text.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
          Text(
            [c.hospital.city, c.doctor?.fullName].whereType<String>().join(' · '),
            style: context.text.bodySmall,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 6),
          StatusBadge.forEnum(c.status, dense: true),
          const Divider(height: 20),
          if (q == null) ...[
            if (c.quoteDueAt != null)
              QuoteCountdown(dueAt: c.quoteDueAt!, overdue: c.quoteOverdue, dense: true)
            else
              Text(l10n.caseQuotePending, style: context.text.bodySmall),
          ] else ...[
            Text(l10n.paymentTotal, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
            if (total != null && group.currency.toUpperCase() != q.currency.toUpperCase()) ...[
              Text(
                '≈ ${formatMoney(total, group.currency)}',
                style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
              ),
              Text(
                l10n.priceOriginalAmount(formatMoney(q.totalMinor, q.currency)),
                style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
              ),
            ] else
              Text(
                formatMoney(q.totalMinor, q.currency),
                style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w900),
              ),
            const SizedBox(height: 8),
            if (q.estimatedStayDays != null) _fact(context, Icons.hotel_outlined, l10n.quoteGroupStay(q.estimatedStayDays!)),
            if (q.validUntil != null)
              _fact(context, Icons.event_outlined, l10n.bookingValidUntil(Dates.day(q.validUntil))),
            for (final line in q.lineItems.take(4))
              _fact(context, Icons.check_rounded, line.category.label),
            const SizedBox(height: 12),
            if (q.isActionable && c.status == CaseStatus.quoted)
              PrimaryButton(
                key: ValueKey('quote-accept-${c.caseId}'),
                label: l10n.caseAcceptQuote,
                tone: ButtonTone.violet,
                loading: busy,
                onPressed: () => onAccept(q),
              )
            else if (q.status == QuoteStatus.accepted)
              PrimaryButton(
                label: l10n.caseChooseAdmissionDate,
                tone: ButtonTone.violet,
                onPressed: () => context.push(Routes.book(c.caseId, quoteId: q.id)),
              )
            else
              StatusBadge.forEnum(q.status, dense: true),
          ],
        ],
      ),
    );
  }

  Widget _fact(BuildContext context, IconData icon, String text) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Row(
      children: [
        Icon(icon, size: 14, color: context.palette.textSecondary),
        const SizedBox(width: 6),
        Expanded(child: Text(text, style: context.text.bodySmall)),
      ],
    ),
  );
}
