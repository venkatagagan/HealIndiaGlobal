import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/discharge_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Medicine reminders: one daily push / in-app notification (sent by the server) at the chosen local hour
/// while each medicine of the summary is due. Patient only.
class MedicationRemindersCard extends ConsumerStatefulWidget {
  const MedicationRemindersCard({super.key, required this.summaryId});

  final String summaryId;

  @override
  ConsumerState<MedicationRemindersCard> createState() => _MedicationRemindersCardState();
}

class _MedicationRemindersCardState extends ConsumerState<MedicationRemindersCard> {
  bool _busy = false;

  /// Local edits shown while saving (null = take the server's values).
  bool? _enabled;
  int? _hour;

  Future<void> _save({required bool enabled, required int hour}) async {
    setState(() {
      _busy = true;
      _enabled = enabled;
      _hour = hour;
    });
    try {
      await ref.read(dischargeRepositoryProvider).setReminders(widget.summaryId, enabled: enabled, remindHour: hour);
      ref.invalidate(medicationRemindersProvider(widget.summaryId));
      if (mounted) {
        showInfoSnack(context, enabled ? context.l10n.dischargeRemindersOn : context.l10n.dischargeRemindersOff);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _enabled = null;
          _hour = null;
        });
        showErrorSnack(context, e);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final value = ref.watch(medicationRemindersProvider(widget.summaryId));
    return AppCard(
      key: const ValueKey('discharge-reminders'),
      child: AsyncValueView<List<MedicationReminder>>(
        value: value,
        compactError: true,
        loading: const LinearProgressIndicator(minHeight: 2),
        onRetry: () => ref.invalidate(medicationRemindersProvider(widget.summaryId)),
        data: (list) {
          final serverEnabled = list.any((r) => r.enabled);
          final serverHour = list.isEmpty ? 9 : list.first.remindHour;
          final enabled = _enabled ?? serverEnabled;
          final hour = _hour ?? serverHour;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SwitchListTile(
                key: const ValueKey('discharge-reminders-switch'),
                contentPadding: EdgeInsets.zero,
                secondary: const Icon(Icons.alarm_rounded, color: AppColors.violet),
                title: Text(l10n.dischargeRemindersSwitch, style: context.text.titleSmall),
                subtitle: Text(l10n.dischargeRemindersHint, style: context.text.bodySmall),
                value: enabled,
                onChanged: _busy ? null : (v) => _save(enabled: v, hour: hour),
              ),
              Row(
                children: [
                  Expanded(child: Text(l10n.dischargeRemindersTime, style: context.text.bodyMedium)),
                  DropdownButton<int>(
                    key: const ValueKey('discharge-reminders-hour'),
                    value: hour,
                    onChanged: _busy || !enabled ? null : (h) => _save(enabled: true, hour: h ?? hour),
                    items: [
                      for (var h = 0; h < 24; h++)
                        DropdownMenuItem(value: h, child: Text(Dates.time(DateTime(2000, 1, 1, h)))),
                    ],
                  ),
                ],
              ),
              if (enabled)
                for (final r in list)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '${r.name}${l10n.commonListSeparator}'
                      '${r.endOn == null ? l10n.dischargeMedicationOngoing : l10n.dischargeReminderUntil(Dates.day(r.endOn))}',
                      style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                    ),
                  ),
            ],
          );
        },
      ),
    );
  }
}
