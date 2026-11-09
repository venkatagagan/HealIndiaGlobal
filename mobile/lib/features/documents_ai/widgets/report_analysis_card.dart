import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../models/document_analysis.dart';
import 'report_style.dart';

/// Read-only view of a report analysis (Trips → Documents, case screens, confirmed state).
///
/// Shows the confirmed data when there is one (else the draft), with "Edited" markers where the
/// patient changed the AI output, flag colors, critical / red-flag banners and the AI disclaimer.
class ReportAnalysisCard extends StatelessWidget {
  const ReportAnalysisCard({super.key, required this.analysis, this.onTap, this.compact = false});

  final DocumentAnalysis analysis;
  final VoidCallback? onTap;

  /// Header + summary only (lists).
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final a = analysis;
    final d = a.effective;
    final edited = a.editedKeys;
    final critical = d.labValues.where((v) => v.flag == LabFlag.critical).toList();
    final muted = context.text.bodySmall?.copyWith(color: context.palette.textSecondary);
    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.description_outlined, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  d.docType?.label ?? 'Medical report',
                  style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
              _StatusBadge(analysis: a),
            ],
          ),
          if (d.reportDate != null || d.facilityName.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              [
                if (d.reportDate != null) DateFormat.yMMMd().format(d.reportDate!),
                if (d.facilityName.isNotEmpty) d.facilityName,
              ].join(' · '),
              style: muted,
            ),
          ],
          if (a.redFlags.isNotEmpty) ...[
            const SizedBox(height: 12),
            ReportAlertBanner(title: 'Important', lines: a.redFlags),
          ],
          if (critical.isNotEmpty) ...[
            const SizedBox(height: 12),
            ReportAlertBanner(
              title: 'Critical values',
              icon: Icons.science_outlined,
              lines: [for (final v in critical) '${v.test}: ${v.value} ${v.unit}'.trim()],
            ),
          ],
          if (d.summaryPatient.isNotEmpty) ...[
            ReportSectionHeader('Summary', edited: edited.contains('summary_patient')),
            Text(d.summaryPatient, style: context.text.bodyMedium),
          ],
          if (!compact) ...[
            if (d.keyFindings.isNotEmpty) ...[
              ReportSectionHeader('Key findings', edited: edited.contains('key_findings')),
              for (final f in d.keyFindings)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 5),
                        child: Icon(Icons.circle, size: 10, color: ReportStyle.significance(f.significance)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(child: Text(f.finding, style: context.text.bodyMedium)),
                    ],
                  ),
                ),
            ],
            if (d.labValues.isNotEmpty) ...[
              ReportSectionHeader('Lab values', edited: edited.contains('lab_values')),
              _LabTable(values: d.labValues),
            ],
            if (d.medications.isNotEmpty) ...[
              ReportSectionHeader('Medications', edited: edited.contains('medications')),
              for (final m in d.medications)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    [m.name, m.dose, m.frequency].where((s) => s.isNotEmpty).join(' · '),
                    style: context.text.bodyMedium,
                  ),
                ),
            ],
            ..._list(context, 'Diagnoses mentioned', d.diagnoses, edited.contains('diagnoses_mentioned')),
            ..._list(context, 'Procedures mentioned', d.procedures, edited.contains('procedures_mentioned')),
            ..._list(context, 'Recommendations', d.recommendations, edited.contains('recommendations')),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Icon(Icons.auto_awesome_rounded, size: 14, color: context.palette.textMuted),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  ReportStyle.disclaimer,
                  style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  List<Widget> _list(BuildContext context, String title, List<String> items, bool edited) => [
    if (items.isNotEmpty) ...[
      ReportSectionHeader(title, edited: edited),
      for (final s in items)
        Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text('• $s', style: context.text.bodyMedium),
        ),
    ],
  ];
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.analysis});

  final DocumentAnalysis analysis;

  @override
  Widget build(BuildContext context) {
    final a = analysis;
    if (a.isConfirmed) {
      return const StatusBadge(label: 'Confirmed', color: AppColors.primary, icon: Icons.verified_rounded, dense: true);
    }
    if (a.isRejected) return const StatusBadge(label: 'Discarded', color: AppColors.darkTextMuted, dense: true);
    return switch (a.status) {
      AnalysisStatus.queued ||
      AnalysisStatus.processing => const StatusBadge(label: 'Reading…', color: AppColors.info, dense: true),
      AnalysisStatus.failed ||
      AnalysisStatus.unsupported => const StatusBadge(label: 'Not read', color: AppColors.danger, dense: true),
      AnalysisStatus.completed => const StatusBadge(label: 'Needs review', color: AppColors.warning, dense: true),
    };
  }
}

class _LabTable extends StatelessWidget {
  const _LabTable({required this.values});

  final List<LabValue> values;

  @override
  Widget build(BuildContext context) {
    final head = context.text.labelSmall?.copyWith(color: context.palette.textSecondary, fontWeight: FontWeight.w700);
    return Table(
      columnWidths: const {0: FlexColumnWidth(3), 1: FlexColumnWidth(2), 2: FlexColumnWidth(2)},
      defaultVerticalAlignment: TableCellVerticalAlignment.middle,
      children: [
        TableRow(
          children: [
            Text('Test', style: head),
            Text('Result', style: head),
            Text('Range', style: head),
          ],
        ),
        for (final v in values)
          TableRow(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(v.test, style: context.text.bodySmall),
              ),
              Text(
                '${v.value} ${v.unit}'.trim(),
                style: context.text.bodySmall?.copyWith(
                  color: ReportStyle.labFlag(v.flag),
                  fontWeight: v.flag == LabFlag.normal || v.flag == LabFlag.unknown ? null : FontWeight.w800,
                ),
              ),
              Text(v.referenceRange, style: context.text.labelSmall?.copyWith(color: context.palette.textMuted)),
            ],
          ),
      ],
    );
  }
}
