import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../data/document_analysis_repository.dart';
import '../screens/report_capture_screen.dart';
import 'report_analysis_card.dart';

/// Entry point for Trips → Documents (and case screens): an app-bar action that opens
/// "Scan a report with AI" and the list of AI report readings (each opens `/reports/analysis/:id`).
///
/// [onUploaded] is called after the capture flow uploaded pages (e.g. to refresh a documents list).
class ReportAiEntryButton extends ConsumerWidget {
  const ReportAiEntryButton({super.key, this.caseId, this.onUploaded});

  final String? caseId;
  final VoidCallback? onUploaded;

  @override
  Widget build(BuildContext context, WidgetRef ref) => IconButton(
    key: const ValueKey('report-ai-entry'),
    tooltip: 'Read reports with AI',
    icon: const Icon(Icons.document_scanner_outlined),
    onPressed: () => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => ReportAnalysesSheet(caseId: caseId, onUploaded: onUploaded),
    ),
  );
}

/// Bottom sheet: "Scan a report" + the patient's report readings.
class ReportAnalysesSheet extends ConsumerWidget {
  const ReportAnalysesSheet({super.key, this.caseId, this.onUploaded});

  final String? caseId;
  final VoidCallback? onUploaded;

  Future<void> _scan(BuildContext context, WidgetRef ref) async {
    final router = GoRouter.of(context);
    Navigator.of(context).pop();
    final result = await router.push<ReportCaptureResult>(
      Routes.reportCaptureFor(caseId: caseId, kind: DocumentKind.medicalReport),
    );
    if (result != null) onUploaded?.call();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analyses = ref.watch(documentAnalysesProvider(caseId));
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            Text('Your reports, read by AI', style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(
              'Photograph a paper report or pick a PDF. You check and confirm everything before it is used.',
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
            const SizedBox(height: 12),
            PrimaryButton(
              label: 'Scan a report',
              icon: Icons.photo_camera_rounded,
              onPressed: () => _scan(context, ref),
            ),
            const SizedBox(height: 8),
            ...analyses.when(
              loading: () => [const Padding(padding: EdgeInsets.all(24), child: LoadingView())],
              error: (e, _) => [
                ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(documentAnalysesProvider(caseId))),
              ],
              data: (items) => items.isEmpty
                  ? [
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'No AI readings yet.',
                          textAlign: TextAlign.center,
                          style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
                        ),
                      ),
                    ]
                  : [
                      for (final a in items)
                        Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: ReportAnalysisCard(
                            analysis: a,
                            compact: true,
                            onTap: () {
                              final router = GoRouter.of(context);
                              Navigator.of(context).pop();
                              unawaited(router.push<void>(Routes.reportAnalysis(a.id)));
                            },
                          ),
                        ),
                    ],
            ),
          ],
        ),
      ),
    );
  }
}
