import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Localized label of a check-in red flag code.
String redFlagLabel(AppLocalizations l10n, String code) => switch (code) {
  'fever' => l10n.aftercareFlagFever,
  'breathlessness' => l10n.aftercareFlagBreathlessness,
  'severe_pain' => l10n.aftercareFlagSeverePain,
  'wound_concerns' => l10n.aftercareFlagWound,
  _ => code,
};

/// Localized medication adherence answer (`all | some | none`).
String adherenceLabel(AppLocalizations l10n, String? value) => switch (value) {
  'all' => l10n.aftercareMedsAll,
  'some' => l10n.aftercareMedsSome,
  'none' => l10n.aftercareMedsNone,
  _ => '-',
};

/// One recovery check-in: day, due / submitted date, answers, red flags highlighted.
class CheckinSummaryTile extends StatelessWidget {
  const CheckinSummaryTile({super.key, required this.checkin, this.onAnswer});

  final AftercareCheckin checkin;

  /// Shown as "Answer now" for a due, unanswered check-in.
  final VoidCallback? onAnswer;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final c = checkin;
    final flagged = c.hasRedFlags;
    return AppCard(
      key: ValueKey('checkin-${c.id}'),
      margin: const EdgeInsets.only(bottom: 8),
      borderColor: flagged ? AppColors.danger : null,
      color: flagged ? AppColors.danger.withValues(alpha: 0.08) : null,
      onTap: onAnswer,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                flagged ? Icons.warning_amber_rounded : (c.submitted ? Icons.task_alt_rounded : Icons.pending_actions_rounded),
                color: flagged ? AppColors.danger : (c.submitted ? AppColors.primary : AppColors.warning),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(l10n.aftercareCheckinDay(c.day), style: context.text.titleSmall),
              ),
              Text(
                c.submitted ? Dates.day(c.submittedAt) : Dates.day(c.dueAt),
                style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
              ),
            ],
          ),
          if (c.caseNumber != null)
            Text(c.caseNumber!, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
          if (flagged) ...[
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                for (final f in c.redFlags)
                  StatusBadge(label: redFlagLabel(l10n, f), color: AppColors.danger, icon: Icons.priority_high_rounded, dense: true),
              ],
            ),
          ],
          if (c.submitted) ...[
            const SizedBox(height: 6),
            Text(
              [
                if (c.pain != null) l10n.aftercarePainValue(c.pain!),
                l10n.aftercareMedsValue(adherenceLabel(l10n, jStrOrNull(c.answers, 'medication_adherence'))),
              ].join(' · '),
              style: context.text.bodySmall,
            ),
            if ((c.freeText ?? '').isNotEmpty) Text('“${c.freeText}”', style: context.text.bodySmall),
          ] else if (onAnswer != null) ...[
            const SizedBox(height: 8),
            PrimaryButton(label: l10n.aftercareAnswerNow, icon: Icons.edit_note_rounded, onPressed: onAnswer, expand: false),
          ] else
            Text(l10n.aftercareNotAnswered, style: context.text.bodySmall),
        ],
      ),
    );
  }
}
