import 'package:flutter/material.dart';

import '../../../l10n/l10n.dart';
import '../widgets/report_analysis_view.dart';

/// `/reports/analysis/:id` — review (or view) one report analysis. Used from Trips → Documents and
/// case screens; the capture flow shows the same [ReportAnalysisView] inline.
class ReportAnalysisScreen extends StatelessWidget {
  const ReportAnalysisScreen({super.key, required this.analysisId});

  final String analysisId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.reportAnalysisTitle)),
      body: ReportAnalysisView(
        analysisId: analysisId,
        onFinished: (a) {
          if (a.isConfirmed) {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.reportConfirmedSnack)));
          }
        },
      ),
    );
  }
}
