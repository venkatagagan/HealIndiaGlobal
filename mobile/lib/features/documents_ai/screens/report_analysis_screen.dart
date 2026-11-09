import 'package:flutter/material.dart';

import '../widgets/report_analysis_view.dart';

/// `/reports/analysis/:id` — review (or view) one report analysis. Used from Trips → Documents and
/// case screens; the capture flow shows the same [ReportAnalysisView] inline.
class ReportAnalysisScreen extends StatelessWidget {
  const ReportAnalysisScreen({super.key, required this.analysisId});

  final String analysisId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Your report')),
      body: ReportAnalysisView(
        analysisId: analysisId,
        onFinished: (a) {
          if (a.isConfirmed) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Report confirmed.')));
          }
        },
      ),
    );
  }
}
