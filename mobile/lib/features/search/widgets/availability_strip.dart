import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../providers/search_providers.dart';

/// Next-30-days availability preview (green = open slots) for a doctor or hospital.
class AvailabilityPreview extends ConsumerWidget {
  const AvailabilityPreview({super.key, required this.id, required this.doctor, this.nextAvailable});

  final String id;
  final bool doctor;

  /// `DoctorDetail.next_available_date`, shown as a headline when present.
  final DateTime? nextAvailable;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = (id: id, doctor: doctor);
    final value = ref.watch(availabilityPreviewProvider(query));
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.event_available_outlined, color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text('Availability (next 30 days)', style: context.text.titleSmall)),
            ],
          ),
          const SizedBox(height: 10),
          value.when(
            loading: () => const SizedBox(height: 64, child: Center(child: CircularProgressIndicator(strokeWidth: 2.4))),
            error: (e, _) => ErrorView(
              error: e,
              compact: true,
              onRetry: () => ref.invalidate(availabilityPreviewProvider(query)),
            ),
            data: (slots) => _Strip(slots: slots, nextAvailable: nextAvailable),
          ),
        ],
      ),
    );
  }
}

class _Strip extends StatelessWidget {
  const _Strip({required this.slots, this.nextAvailable});

  final List<AvailabilitySlot> slots;
  final DateTime? nextAvailable;

  @override
  Widget build(BuildContext context) {
    final byDay = <DateTime, int>{};
    for (final s in slots) {
      final d = Dates.dateOnly(s.date);
      byDay[d] = (byDay[d] ?? 0) + (s.available > 0 ? s.available : 0);
    }
    final today = Dates.dateOnly(DateTime.now());
    final days = [for (var i = 0; i < 30; i++) today.add(Duration(days: i))];
    final firstOpen = days.where((d) => (byDay[d] ?? 0) > 0).firstOrNull ?? nextAvailable;
    final weekday = DateFormat('EEE');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          firstOpen == null
              ? 'No open slots published yet - request a quote and the hospital will propose dates.'
              : 'Next available: ${Dates.weekday(firstOpen)}',
          style: context.text.bodySmall?.copyWith(
            color: firstOpen == null ? context.palette.textSecondary : AppColors.primary,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 58,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: days.length,
            separatorBuilder: (_, _) => const SizedBox(width: 6),
            itemBuilder: (context, i) {
              final d = days[i];
              final open = (byDay[d] ?? 0) > 0;
              return Semantics(
                label: '${Dates.weekday(d)}: ${open ? 'available' : 'unavailable'}',
                excludeSemantics: true,
                child: Container(
                  width: 44,
                  decoration: BoxDecoration(
                    color: open ? AppColors.primary : context.palette.surfaceAlt,
                    borderRadius: BorderRadius.circular(AppRadius.sm),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        weekday.format(d),
                        style: context.text.labelSmall?.copyWith(
                          color: open ? const Color(0xFF052E16) : context.palette.textMuted,
                        ),
                      ),
                      Text(
                        '${d.day}',
                        style: context.text.titleSmall?.copyWith(
                          color: open ? const Color(0xFF052E16) : context.palette.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
