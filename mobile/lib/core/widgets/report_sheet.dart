import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../network/api_exception.dart';
import '../repositories/report_repository.dart';
import '../theme/app_theme.dart';
import 'buttons.dart';

/// Snackbar text after a report was sent.
const kReportThanks = 'Thanks. Our team will review this report.';

/// Opens the "Report" bottom sheet (CG-16) for a chat message or an AI result and, when the report was
/// sent, shows the thank-you snackbar. Returns true when a report was sent.
Future<bool> showReportSheet(BuildContext context, {required ReportTargetType type, required String targetId}) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final sent = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => ReportSheet(type: type, targetId: targetId),
  );
  if (sent == true) {
    messenger
      ?..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(content: Text(kReportThanks)));
  }
  return sent ?? false;
}

/// Reason picker + optional note, posting `POST /reports`. Pops `true` once the report is accepted.
class ReportSheet extends ConsumerStatefulWidget {
  const ReportSheet({super.key, required this.type, required this.targetId});

  final ReportTargetType type;
  final String targetId;

  @override
  ConsumerState<ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends ConsumerState<ReportSheet> {
  final _note = TextEditingController();
  ReportReason? _reason;
  bool _sending = false;
  String? _error;

  String get _title => switch (widget.type) {
    ReportTargetType.message => 'Report this message',
    ReportTargetType.screeningResult || ReportTargetType.documentAnalysis => 'Report this result',
  };

  String get _intro => switch (widget.type) {
    ReportTargetType.message =>
      'Tell us what is wrong with this message. Our team will look at it. The sender is not told who reported it.',
    ReportTargetType.screeningResult || ReportTargetType.documentAnalysis =>
      'Tell us what is wrong with this AI result. Our team will look at it and use it to improve the results.',
  };

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final reason = _reason;
    if (reason == null || _sending) return;
    final navigator = Navigator.of(context);
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(reportRepositoryProvider)
          .report(type: widget.type, targetId: widget.targetId, reason: reason, note: _note.text);
      if (mounted) navigator.pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = e is ApiException && e.isRateLimited
            ? 'You have sent a lot of reports. Please try again later.'
            : errorMessage(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final reasons = ReportReason.forTarget(widget.type);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.flag_outlined, color: AppColors.danger),
                const SizedBox(width: 8),
                Expanded(child: Text(_title, style: context.text.titleMedium)),
                IconButton(
                  tooltip: 'Close',
                  onPressed: _sending ? null : () => Navigator.of(context).pop(false),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            Text(_intro, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
            const SizedBox(height: 8),
            RadioGroup<ReportReason>(
              groupValue: _reason,
              onChanged: (v) {
                if (!_sending) setState(() => _reason = v);
              },
              child: Column(
                children: [
                  for (final r in reasons)
                    RadioListTile<ReportReason>(
                      key: Key('report-reason-${r.json}'),
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      value: r,
                      title: Text(r.label),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            TextField(
              key: const Key('report-note'),
              controller: _note,
              enabled: !_sending,
              minLines: 2,
              maxLines: 4,
              maxLength: ReportRepository.maxNoteLength,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Add a note (optional)',
                hintText: 'Anything that helps our team understand the problem',
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 4),
              Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
            ],
            const SizedBox(height: 12),
            PrimaryButton(
              key: const Key('report-send'),
              label: 'Send report',
              icon: Icons.flag_rounded,
              loading: _sending,
              onPressed: _reason == null || _sending ? null : _send,
            ),
          ],
        ),
      ),
    );
  }
}
