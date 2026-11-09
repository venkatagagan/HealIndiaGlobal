import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../network/api_exception.dart';
import '../repositories/report_repository.dart';
import '../theme/app_theme.dart';
import 'buttons.dart';

/// Opens the "Report" bottom sheet (CG-16) for a chat message or an AI result and, when the report was
/// sent, shows the thank-you snackbar. Returns true when a report was sent.
Future<bool> showReportSheet(BuildContext context, {required ReportTargetType type, required String targetId}) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final thanks = context.l10n.reportSheetThanks;
  final sent = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => ReportSheet(type: type, targetId: targetId),
  );
  if (sent == true) {
    messenger
      ?..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(thanks)));
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

  String _title(AppLocalizations l) => switch (widget.type) {
    ReportTargetType.message => l.reportSheetTitleMessage,
    ReportTargetType.screeningResult || ReportTargetType.documentAnalysis => l.reportSheetTitleResult,
  };

  String _intro(AppLocalizations l) => switch (widget.type) {
    ReportTargetType.message => l.reportSheetIntroMessage,
    ReportTargetType.screeningResult || ReportTargetType.documentAnalysis => l.reportSheetIntroResult,
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
            ? context.l10n.reportSheetRateLimited
            : errorMessage(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final reasons = ReportReason.forTarget(widget.type);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsetsDirectional.fromSTEB(20, 8, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.flag_outlined, color: AppColors.danger),
                const SizedBox(width: 8),
                Expanded(child: Text(_title(l10n), style: context.text.titleMedium)),
                IconButton(
                  tooltip: l10n.commonClose,
                  onPressed: _sending ? null : () => Navigator.of(context).pop(false),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            Text(_intro(l10n), style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
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
                      title: Text(r.labelIn(l10n)),
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
              decoration: InputDecoration(labelText: l10n.reportSheetNoteLabel, hintText: l10n.reportSheetNoteHint),
            ),
            if (_error != null) ...[
              const SizedBox(height: 4),
              Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
            ],
            const SizedBox(height: 12),
            PrimaryButton(
              key: const Key('report-send'),
              label: l10n.reportSheetSend,
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
