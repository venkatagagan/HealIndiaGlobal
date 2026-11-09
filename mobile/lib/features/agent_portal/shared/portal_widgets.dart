/// UI building blocks shared by the agent and hospital shells (dark design of the patient app).
library;

import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';

/// One bottom-nav destination of a partner shell.
class PortalTab {
  const PortalTab({required this.label, required this.icon, required this.selectedIcon, required this.builder});

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final WidgetBuilder builder;
}

/// Bottom-navigation shell: keeps every visited tab alive (IndexedStack), builds tabs lazily.
class PortalShellScaffold extends StatefulWidget {
  const PortalShellScaffold({super.key, required this.tabs, this.initialIndex = 0, this.badges = const {}});

  final List<PortalTab> tabs;
  final int initialIndex;
  final Map<int, int> badges;

  @override
  State<PortalShellScaffold> createState() => PortalShellScaffoldState();
}

class PortalShellScaffoldState extends State<PortalShellScaffold> {
  late int _index = widget.initialIndex.clamp(0, widget.tabs.length - 1);
  late final Set<int> _built = {_index};

  int get index => _index;

  /// Switches to tab [i] (used by dashboard shortcuts).
  void select(int i) => setState(() {
    _index = i;
    _built.add(i);
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: [
          for (var i = 0; i < widget.tabs.length; i++)
            _built.contains(i) ? Builder(builder: widget.tabs[i].builder) : const SizedBox.shrink(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: select,
        destinations: [
          for (var i = 0; i < widget.tabs.length; i++)
            NavigationDestination(
              label: widget.tabs[i].label,
              tooltip: widget.tabs[i].label,
              icon: _badged(Icon(widget.tabs[i].icon), widget.badges[i] ?? 0),
              selectedIcon: _badged(Icon(widget.tabs[i].selectedIcon), widget.badges[i] ?? 0),
            ),
        ],
      ),
    );
  }

  Widget _badged(Widget icon, int count) =>
      count <= 0 ? icon : Badge(label: Text(count > 99 ? '99+' : '$count'), child: icon);
}

/// Switches the enclosing [PortalShellScaffold] to tab [index] (no-op outside a shell).
void selectPortalTab(BuildContext context, int index) =>
    context.findAncestorStateOfType<PortalShellScaffoldState>()?.select(index);

/// KPI card: big value, label and icon.
class KpiTile extends StatelessWidget {
  const KpiTile({super.key, required this.label, required this.value, required this.icon, this.color, this.onTap});

  final String label;
  final String value;
  final IconData icon;
  final Color? color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppColors.primary;
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: c.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: c, size: 20),
          ),
          const SizedBox(height: 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// Two-column grid of [KpiTile]s.
class KpiGrid extends StatelessWidget {
  const KpiGrid({super.key, required this.tiles});

  final List<Widget> tiles;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final w = (c.maxWidth - 12) / 2;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [for (final t in tiles) SizedBox(width: w, child: t)],
        );
      },
    );
  }
}

/// A simple monthly bar chart (labels under bars, values above).
class MonthlyBars extends StatelessWidget {
  const MonthlyBars({super.key, required this.points, this.color = AppColors.primary, this.format});

  /// `(label, value)` pairs, oldest first.
  final List<(String, num)> points;
  final Color color;
  final String Function(num value)? format;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text('No activity yet', style: context.text.bodySmall?.copyWith(color: context.palette.textMuted)),
      );
    }
    final maxV = points.map((p) => p.$2).fold<num>(0, (a, b) => b > a ? b : a);
    return SizedBox(
      height: 150,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final p in points)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        format?.call(p.$2) ?? '${p.$2}',
                        style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      height: maxV <= 0 ? 4 : 4 + 96 * (p.$2 / maxV),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: p.$2 > 0 ? 0.85 : 0.25),
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      monthLabel(p.$1),
                      style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
                      maxLines: 1,
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// `2026-07` -> `Jul`; anything else is returned unchanged.
String monthLabel(String month) {
  final d = DateTime.tryParse(month.length == 7 ? '$month-01' : month);
  if (d == null) return month;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[d.month - 1];
}

/// Label / value row used in detail cards.
class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value, {super.key, this.valueWidget});

  final String label;
  final String? value;
  final Widget? valueWidget;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
          ),
          Expanded(
            child:
                valueWidget ??
                Text(
                  (value == null || value!.isEmpty) ? '—' : value!,
                  style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                ),
          ),
        ],
      ),
    );
  }
}

/// Status pill for a raw wire value (`pending_payment` -> "Pending payment").
StatusBadge statusBadge(String status, {bool dense = true}) =>
    StatusBadge(label: humanizeEnumValue(status), color: AppColors.statusColor(status), dense: dense);

/// Formats a money amount (minor units), e.g. `₹120,000` / `$4,500`.
String money(int minor, String currency, {bool compact = false}) => formatMoney(minor, currency, compact: compact);

/// Case row: number, patient, hospital / procedure, status, latest quote.
class CaseTile extends StatelessWidget {
  const CaseTile({super.key, required this.medicalCase, this.onTap, this.showHospital = true, this.showPatient = true});

  final MedicalCase medicalCase;
  final VoidCallback? onTap;
  final bool showHospital;
  final bool showPatient;

  @override
  Widget build(BuildContext context) {
    final c = medicalCase;
    final q = c.latestQuote;
    return AppCard(
      onTap: onTap,
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  c.caseNumber,
                  style: context.text.labelMedium?.copyWith(color: context.palette.textSecondary),
                ),
              ),
              StatusBadge.forEnum(c.status, dense: true),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            showPatient ? (c.patient?.fullName ?? 'Patient') : c.title,
            style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 2),
          Text(
            [
              if (showPatient) c.title,
              if (showHospital) [c.hospital.name, c.hospital.city].whereType<String>().join(', '),
              if (!showHospital && c.patient?.nationality != null) c.patient!.nationality!,
            ].where((s) => s.isNotEmpty).join(' · '),
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          if (q != null) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Icon(Icons.request_quote_outlined, size: 16, color: context.palette.textMuted),
                MoneyText(q.totalMinor, q.currency, style: context.text.titleSmall),
                statusBadge(q.status.json),
              ],
            ),
          ],
          if (c.createdAt != null) ...[
            const SizedBox(height: 6),
            Text(
              'Opened ${Dates.relative(c.createdAt)}',
              style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
            ),
          ],
        ],
      ),
    );
  }
}

/// Itemised quote: plan, line items and total.
class QuoteBreakdown extends StatelessWidget {
  const QuoteBreakdown({super.key, required this.quote});

  final Quote quote;

  @override
  Widget build(BuildContext context) {
    final q = quote;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if ((q.treatmentPlan ?? '').isNotEmpty) ...[
          Text(q.treatmentPlan!, style: context.text.bodyMedium),
          const SizedBox(height: 10),
        ],
        for (final li in q.lineItems)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: '${li.category.label}  ',
                          style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
                        ),
                        TextSpan(text: li.description, style: context.text.bodyMedium),
                      ],
                    ),
                  ),
                ),
                MoneyText(li.amountMinor, q.currency, style: context.text.bodyMedium),
              ],
            ),
          ),
        const Divider(height: 20),
        Row(
          children: [
            Expanded(
              child: Text('Total', style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            ),
            MoneyText(
              q.totalMinor,
              q.currency,
              style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800, color: AppColors.primary),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          [
            if (q.estimatedStayDays != null) '${q.estimatedStayDays} day stay',
            if (q.validUntil != null) 'valid until ${Dates.day(q.validUntil)}',
            if (q.preparedByName != null) 'by ${q.preparedByName}',
          ].join(' · '),
          style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
        ),
      ],
    );
  }
}

/// Asks for confirmation; resolves true when confirmed.
Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  String? message,
  String confirmLabel = 'Confirm',
  bool destructive = false,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: message == null ? null : Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
        FilledButton(
          style: destructive ? FilledButton.styleFrom(backgroundColor: AppColors.danger) : null,
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return ok ?? false;
}

/// Asks for a single line / paragraph of text; null when cancelled.
Future<String?> promptText(
  BuildContext context, {
  required String title,
  String label = '',
  String confirmLabel = 'Save',
  String? initial,
  bool required = false,
  int maxLines = 1,
}) {
  return showDialog<String>(
    context: context,
    builder: (_) => _PromptDialog(
      title: title,
      label: label,
      confirmLabel: confirmLabel,
      initial: initial,
      required: required,
      maxLines: maxLines,
    ),
  );
}

/// Owns its controller so it outlives the dialog's exit animation.
class _PromptDialog extends StatefulWidget {
  const _PromptDialog({
    required this.title,
    required this.label,
    required this.confirmLabel,
    required this.initial,
    required this.required,
    required this.maxLines,
  });

  final String title;
  final String label;
  final String confirmLabel;
  final String? initial;
  final bool required;
  final int maxLines;

  @override
  State<_PromptDialog> createState() => _PromptDialogState();
}

class _PromptDialogState extends State<_PromptDialog> {
  late final _ctrl = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _ctrl,
        autofocus: true,
        maxLines: widget.maxLines,
        decoration: InputDecoration(labelText: widget.label),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(
          onPressed: () {
            final v = _ctrl.text.trim();
            if (widget.required && v.isEmpty) return;
            Navigator.of(context).pop(v);
          },
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}

/// Horizontal list of filter chips for a status filter (null = all).
class StatusFilterBar<T> extends StatelessWidget {
  const StatusFilterBar({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
    required this.labelOf,
    this.allLabel = 'All',
  });

  final List<T> options;
  final T? selected;
  final ValueChanged<T?> onSelected;
  final String Function(T) labelOf;
  final String allLabel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        children: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(label: Text(allLabel), selected: selected == null, onSelected: (_) => onSelected(null)),
          ),
          for (final o in options)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(label: Text(labelOf(o)), selected: selected == o, onSelected: (_) => onSelected(o)),
            ),
        ],
      ),
    );
  }
}
