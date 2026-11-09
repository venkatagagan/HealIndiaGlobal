import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../l10n/l10n.dart';
import '../models/document_analysis.dart';

/// Shared colors / labels of the report UI.
abstract final class ReportStyle {
  /// AI disclaimer in the current language (widgets with a context can use `context.l10n.reportAiDisclaimer`).
  static String get disclaimer => L10n.current.reportAiDisclaimer;

  static Color labFlag(LabFlag f) => switch (f) {
    LabFlag.normal => AppColors.primary,
    LabFlag.low || LabFlag.high => AppColors.warning,
    LabFlag.critical => AppColors.danger,
    LabFlag.unknown => AppColors.darkTextSecondary,
  };

  static Color significance(FindingSignificance s) => switch (s) {
    FindingSignificance.normal => AppColors.primary,
    FindingSignificance.attention => AppColors.warning,
    FindingSignificance.urgent => AppColors.danger,
  };
}

/// Small "Edited" marker shown where the patient changed the AI output.
class EditedMarker extends StatelessWidget {
  const EditedMarker({super.key});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    decoration: BoxDecoration(color: AppColors.violetSoft, borderRadius: BorderRadius.circular(AppRadius.pill)),
    child: Text(
      context.l10n.reportEdited,
      style: context.text.labelSmall?.copyWith(color: AppColors.violet, fontWeight: FontWeight.w700),
    ),
  );
}

/// Red banner listing red flags / critical values.
class ReportAlertBanner extends StatelessWidget {
  const ReportAlertBanner({super.key, required this.title, required this.lines, this.icon = Icons.warning_rounded});

  final String title;
  final List<String> lines;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.dangerSoft,
        border: Border.all(color: AppColors.danger),
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.danger),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                for (final l in lines) ...[const SizedBox(height: 4), Text('• $l', style: context.text.bodySmall)],
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

/// Section header with an optional "Edited" marker.
class ReportSectionHeader extends StatelessWidget {
  const ReportSectionHeader(this.title, {super.key, this.edited = false, this.trailing});

  final String title;
  final bool edited;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 18, bottom: 8),
    child: Row(
      children: [
        Flexible(
          child: Semantics(
            header: true,
            child: Text(title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          ),
        ),
        if (edited) ...[const SizedBox(width: 8), const EditedMarker()],
        const Spacer(),
        ?trailing,
      ],
    ),
  );
}
