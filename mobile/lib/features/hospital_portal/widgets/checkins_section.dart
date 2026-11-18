import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../aftercare/widgets/checkin_tile.dart';
import '../data/hospital_repository.dart';

/// Hospital case detail: the patient's recovery check-ins after discharge, red flags first.
class HospitalCheckinsSection extends ConsumerWidget {
  const HospitalCheckinsSection({super.key, required this.caseId});

  final String caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(hospitalCheckinsProvider(caseId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(l10n.aftercareCheckinsTitle, subtitle: l10n.aftercareHospitalCheckinsHint),
        AsyncValueView<List<AftercareCheckin>>(
          value: value,
          compactError: true,
          loading: const LinearProgressIndicator(minHeight: 2),
          onRetry: () => ref.invalidate(hospitalCheckinsProvider(caseId)),
          data: (list) {
            if (list.isEmpty) return Text(l10n.aftercareNoCheckins, style: context.text.bodySmall);
            final sorted = [...list]
              ..sort((a, b) {
                if (a.hasRedFlags != b.hasRedFlags) return a.hasRedFlags ? -1 : 1;
                return a.day.compareTo(b.day);
              });
            final flagged = list.where((c) => c.hasRedFlags).length;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (flagged > 0)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: StatusBadge(
                      label: l10n.aftercareRedFlagCount(flagged),
                      color: AppColors.danger,
                      icon: Icons.warning_amber_rounded,
                    ),
                  ),
                for (final c in sorted) CheckinSummaryTile(checkin: c),
              ],
            );
          },
        ),
      ],
    );
  }
}
