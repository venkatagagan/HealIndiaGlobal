import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/report_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/report_sheet.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Color of an urgency level.
Color urgencyColor(Urgency u) => switch (u) {
  Urgency.routine => AppColors.primary,
  Urgency.soon => AppColors.info,
  Urgency.urgent => AppColors.warning,
  Urgency.emergency => AppColors.danger,
};

/// Text of an urgency chip (in [l], default the current language).
String urgencyLabel(Urgency u, [AppLocalizations? l]) {
  final t = l ?? L10n.current;
  return switch (u) {
    Urgency.routine => t.enumUrgencyRoutine,
    Urgency.soon => t.aiSummaryUrgencySoon,
    Urgency.urgent => t.enumUrgencyUrgent,
    Urgency.emergency => t.enumUrgencyEmergency,
  };
}

/// AI (or rules engine) summary of the screening: summary text, urgency chip, suggested
/// specialties and expandable details, always with the "not a diagnosis" disclaimer. With a
/// [screeningId] it also offers "Report this result" (CG-16, `target_type` `screening_result`).
class AiSummaryCard extends StatelessWidget {
  const AiSummaryCard({super.key, required this.result, this.urgency, this.screeningId});

  final TriageResult result;

  /// Screening-level urgency (falls back to the result's).
  final Urgency? urgency;

  /// Screening the result belongs to; enables the report action.
  final String? screeningId;

  @override
  Widget build(BuildContext context) {
    final u = urgency ?? result.urgency;
    final l10n = context.l10n;
    final isAi = result.engine == TriageEngine.claude;
    final hasDetails =
        result.possibleConditions.isNotEmpty ||
        result.recommendedTests.isNotEmpty ||
        result.questionsForDoctor.isNotEmpty ||
        (result.travelAdvice?.isNotEmpty ?? false);
    return AppCard(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 8),
      gradient: LinearGradient(
        begin: AlignmentDirectional.topStart,
        end: AlignmentDirectional.bottomEnd,
        colors: context.isDark
            ? const [Color(0xFF2E1065), Color(0xFF161B22)]
            : const [Color(0xFFEDE9FE), Color(0xFFFFFFFF)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(isAi ? Icons.auto_awesome_rounded : Icons.rule_rounded, color: AppColors.violet, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  isAi ? l10n.aiSummaryTitleAi : l10n.aiSummaryTitleRules,
                  style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              StatusBadge(label: urgencyLabel(u, l10n), color: urgencyColor(u), dense: true),
            ],
          ),
          const SizedBox(height: 10),
          Text(result.summary, style: context.text.bodyMedium),
          if (result.suggestedSpecialties.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final s in result.suggestedSpecialties.take(3))
                  StatusBadge(label: s.name, color: AppColors.violet, dense: true),
              ],
            ),
          ],
          if (hasDetails)
            Theme(
              data: context.theme.copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: const EdgeInsets.only(bottom: 8),
                expandedCrossAxisAlignment: CrossAxisAlignment.start,
                title: Text(
                  l10n.aiSummaryMoreDetails,
                  style: context.text.labelLarge?.copyWith(color: AppColors.violet),
                ),
                children: [
                  if (result.possibleConditions.isNotEmpty)
                    _Section(l10n.aiSummaryPossibleConditions, [
                      for (final c in result.possibleConditions)
                        l10n.aiSummaryConditionLikelihood(c.name, c.likelihood.json),
                    ]),
                  if (result.recommendedTests.isNotEmpty) _Section(l10n.aiSummaryTests, result.recommendedTests),
                  if (result.questionsForDoctor.isNotEmpty)
                    _Section(l10n.aiSummaryQuestions, result.questionsForDoctor),
                  if (result.travelAdvice?.isNotEmpty ?? false)
                    _Section(l10n.aiSummaryTravelAdvice, [result.travelAdvice!]),
                ],
              ),
            )
          else
            const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline_rounded, size: 14, color: context.palette.textMuted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  (result.disclaimer?.trim().isNotEmpty ?? false) ? result.disclaimer! : l10n.aiSummaryDisclaimer,
                  style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
                ),
              ),
            ],
          ),
          if (screeningId != null && screeningId!.isNotEmpty)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                key: const Key('report-screening-result'),
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  visualDensity: VisualDensity.compact,
                  foregroundColor: context.palette.textSecondary,
                ),
                onPressed: () =>
                    showReportSheet(context, type: ReportTargetType.screeningResult, targetId: screeningId!),
                icon: const Icon(Icons.flag_outlined, size: 16),
                label: Text(l10n.reportSheetTitleResult),
              ),
            )
          else
            const SizedBox(height: 6),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.title, this.items);

  final String title;
  final List<String> items;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        for (final i in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Text(context.l10n.aiSummaryBullet(i), style: context.text.bodySmall),
          ),
      ],
    ),
  );
}
