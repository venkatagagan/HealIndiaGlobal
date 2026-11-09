import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import 'payee_finance.dart';
import 'portal_widgets.dart';

/// Read-only settlements view of the signed-in payee: balances, items (commissions / settlements),
/// payouts and a statement. Used by the agent "Earnings" tab and the hospital "Settlements" tab.
class PayeeFinanceView extends ConsumerStatefulWidget {
  const PayeeFinanceView({super.key, required this.title, this.itemsLabel = 'Settlements', this.header});

  final String title;
  final String itemsLabel;

  /// Optional widget shown above the balances (e.g. the agent referral card).
  final Widget? header;

  @override
  ConsumerState<PayeeFinanceView> createState() => _PayeeFinanceViewState();
}

class _PayeeFinanceViewState extends ConsumerState<PayeeFinanceView> {
  int _section = 0;
  String? _status;
  int _days = 30;

  Future<void> _refresh() async {
    ref
      ..invalidate(payeeSummaryProvider)
      ..invalidate(settlementItemsProvider)
      ..invalidate(payoutsProvider)
      ..invalidate(statementProvider);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: AppSpacing.pageAll,
          children: [
            ?widget.header,
            _SummaryCard(value: ref.watch(payeeSummaryProvider), onRetry: () => ref.invalidate(payeeSummaryProvider)),
            const SizedBox(height: 16),
            SegmentedButton<int>(
              segments: [
                ButtonSegment(value: 0, label: Text(widget.itemsLabel)),
                const ButtonSegment(value: 1, label: Text('Payouts')),
                const ButtonSegment(value: 2, label: Text('Statement')),
              ],
              selected: {_section},
              showSelectedIcon: false,
              onSelectionChanged: (s) => setState(() => _section = s.first),
            ),
            const SizedBox(height: 12),
            switch (_section) {
              0 => _items(),
              1 => _payouts(),
              _ => _statement(),
            },
          ],
        ),
      ),
    );
  }

  Widget _items() {
    const statuses = ['pending', 'eligible', 'on_hold', 'batched', 'paid', 'reversed'];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            ChoiceChip(
              label: const Text('All'),
              selected: _status == null,
              onSelected: (_) => setState(() => _status = null),
            ),
            for (final s in statuses)
              ChoiceChip(
                label: Text(humanize(s)),
                selected: _status == s,
                onSelected: (_) => setState(() => _status = s),
              ),
          ],
        ),
        const SizedBox(height: 10),
        AsyncValueView(
          value: ref.watch(settlementItemsProvider(_status)),
          compactError: true,
          onRetry: () => ref.invalidate(settlementItemsProvider(_status)),
          data: (page) => page.items.isEmpty
              ? const EmptyView(title: 'Nothing here yet', icon: Icons.receipt_long_outlined)
              : Column(children: [for (final i in page.items) _ItemTile(item: i)]),
        ),
      ],
    );
  }

  Widget _payouts() => AsyncValueView(
    value: ref.watch(payoutsProvider),
    compactError: true,
    onRetry: () => ref.invalidate(payoutsProvider),
    data: (page) => page.items.isEmpty
        ? const EmptyView(title: 'No payouts yet', icon: Icons.account_balance_outlined)
        : Column(
            children: [
              for (final p in page.items)
                AppCard(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              money(p.amountMinor, p.currency),
                              style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            Text(
                              [
                                Dates.day(p.processedAt ?? p.createdAt),
                                if (p.utr != null) 'UTR ${p.utr}',
                                if (p.method != null) humanize(p.method!),
                              ].where((s) => s.isNotEmpty).join(' · '),
                              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                            ),
                            if (p.failureReason != null)
                              Text(p.failureReason!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
                          ],
                        ),
                      ),
                      statusBadge(p.status),
                    ],
                  ),
                ),
            ],
          ),
  );

  Widget _statement() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 6,
          children: [
            for (final d in const [30, 90, 365])
              ChoiceChip(
                label: Text(d == 365 ? '12 months' : '$d days'),
                selected: _days == d,
                onSelected: (_) => setState(() => _days = d),
              ),
          ],
        ),
        const SizedBox(height: 10),
        AsyncValueView(
          value: ref.watch(statementProvider(_days)),
          compactError: true,
          onRetry: () => ref.invalidate(statementProvider(_days)),
          data: (s) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppCard(
                child: Column(
                  children: [
                    InfoRow('Period', '${Dates.day(s.fromDate)} – ${Dates.day(s.toDate)}'),
                    InfoRow('Opening balance', money(s.openingBalanceMinor, s.currency)),
                    InfoRow('Earned', money(s.totalEarnedMinor, s.currency)),
                    InfoRow('Paid out', money(s.totalPaidMinor, s.currency)),
                    InfoRow('Closing balance', money(s.closingBalanceMinor, s.currency)),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              if (s.rows.isEmpty)
                const EmptyView(title: 'No transactions in this period', icon: Icons.description_outlined)
              else
                for (final r in s.rows)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      r.kind == 'payout'
                          ? Icons.account_balance_rounded
                          : r.amountMinor < 0
                          ? Icons.undo_rounded
                          : Icons.add_card_rounded,
                      color: r.amountMinor < 0 ? AppColors.danger : AppColors.primary,
                    ),
                    title: Text(r.description),
                    subtitle: Text(
                      [Dates.day(r.date), r.bookingNumber ?? r.reference ?? ''].where((e) => e.isNotEmpty).join(' · '),
                    ),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          money(r.amountMinor, s.currency),
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: r.amountMinor < 0 ? AppColors.danger : AppColors.primary,
                          ),
                        ),
                        Text(
                          'Bal ${money(r.balanceMinor, s.currency)}',
                          style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Human label of a raw status value.
String humanize(String v) {
  if (v.isEmpty) return v;
  final s = v.replaceAll('_', ' ');
  return s[0].toUpperCase() + s.substring(1);
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.value, required this.onRetry});

  final AsyncValue<PayeeSummary> value;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return AsyncValueView(
      value: value,
      compactError: true,
      onRetry: onRetry,
      data: (s) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppCard(
            gradient: const LinearGradient(colors: [Color(0xFF14532D), Color(0xFF0F172A)]),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Paid to date', style: context.text.bodySmall?.copyWith(color: Colors.white70)),
                Text(
                  money(s.paidMinor, s.currency),
                  style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: Colors.white),
                ),
                const SizedBox(height: 6),
                Text(
                  [
                    'Outstanding ${money(s.outstandingMinor, s.currency)}',
                    if (s.nextPayoutDate != null) 'next payout ${Dates.day(s.nextPayoutDate)}',
                  ].join(' · '),
                  style: context.text.bodySmall?.copyWith(color: Colors.white70),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          KpiGrid(
            tiles: [
              KpiTile(
                label: 'Pending',
                value: money(s.pendingMinor, s.currency),
                icon: Icons.hourglass_top_rounded,
                color: AppColors.warning,
              ),
              KpiTile(
                label: 'Eligible for payout',
                value: money(s.eligibleMinor, s.currency),
                icon: Icons.verified_rounded,
              ),
              KpiTile(
                label: 'On hold',
                value: money(s.onHoldMinor, s.currency),
                icon: Icons.pause_circle_outline_rounded,
                color: AppColors.danger,
              ),
              KpiTile(
                label: 'In payout batch',
                value: money(s.batchedMinor, s.currency),
                icon: Icons.local_shipping_outlined,
                color: AppColors.violet,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ItemTile extends StatelessWidget {
  const _ItemTile({required this.item});

  final SettlementItem item;

  @override
  Widget build(BuildContext context) {
    final i = item;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  i.bookingNumber ?? 'Booking',
                  style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              statusBadge(i.status),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Gross ${money(i.grossMinor, i.currency)} · fee ${money(i.commissionMinor, i.currency)}'
                  '${i.taxMinor > 0 ? ' · GST ${money(i.taxMinor, i.currency)}' : ''}'
                  '${i.tdsMinor > 0 ? ' · TDS ${money(i.tdsMinor, i.currency)}' : ''}',
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              ),
              Text(
                money(i.netMinor, i.currency),
                style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.primary),
              ),
            ],
          ),
          if (i.holdReason != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('On hold: ${i.holdReason}', style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
            ),
          if (i.eligibleAt != null)
            Text(
              'Eligible ${Dates.day(i.eligibleAt)}',
              style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
            ),
        ],
      ),
    );
  }
}
