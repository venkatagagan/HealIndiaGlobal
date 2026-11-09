import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/repositories/report_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/report_sheet.dart';
import '../../../core/widgets/widgets.dart';
import '../data/document_analysis_repository.dart';
import '../models/document_analysis.dart';
import 'report_analysis_card.dart';
import 'report_review_form.dart';
import 'report_style.dart';

/// Loads analysis [analysisId], polls while the AI is reading, then shows the editable review form
/// with "Confirm" / "Discard" (mandatory review → edit → confirm, PLAN §7.1).
///
/// [onFinished] is called with the confirmed or rejected analysis.
class ReportAnalysisView extends ConsumerStatefulWidget {
  const ReportAnalysisView({
    super.key,
    required this.analysisId,
    this.initial,
    this.onFinished,
    this.pollInterval = const Duration(seconds: 2),
  });

  final String analysisId;
  final DocumentAnalysis? initial;
  final ValueChanged<DocumentAnalysis>? onFinished;
  final Duration pollInterval;

  @override
  ConsumerState<ReportAnalysisView> createState() => _ReportAnalysisViewState();
}

class _ReportAnalysisViewState extends ConsumerState<ReportAnalysisView> {
  DocumentAnalysis? _a;
  Object? _loadError;
  Timer? _poll;
  ReportData? _edited;
  bool _busy = false;

  DocumentAnalysisRepository get _repo => ref.read(documentAnalysisRepositoryProvider);

  @override
  void initState() {
    super.initState();
    _a = widget.initial;
    if (_a == null) {
      unawaited(_load());
    } else {
      _schedule();
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final a = await _repo.get(widget.analysisId);
      if (!mounted) return;
      setState(() {
        _a = a;
        _loadError = null;
      });
      _schedule();
    } catch (e) {
      if (!mounted) return;
      if (_a == null) {
        setState(() => _loadError = e);
      } else {
        _schedule(); // transient polling error: keep trying
      }
    }
  }

  void _schedule() {
    _poll?.cancel();
    if (_a?.status.isPending ?? false) _poll = Timer(widget.pollInterval, _load);
  }

  Future<void> _run(Future<DocumentAnalysis> Function() call, {bool finish = false}) async {
    setState(() => _busy = true);
    try {
      final a = await call();
      if (!mounted) return;
      setState(() {
        _a = a;
        _edited = null;
      });
      _schedule();
      if (finish) widget.onFinished?.call(a);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm() async {
    final a = _a!;
    final data = (_edited ?? a.data).cleaned();
    await _run(() => _repo.confirm(a.id, data), finish: true);
  }

  Future<void> _discard() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard this reading?'),
        content: const Text(
          'The AI reading will not be used for your screening or shared with hospitals. '
          'Your uploaded report itself is kept.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep reviewing')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Discard')),
        ],
      ),
    );
    if (ok == true && mounted) await _run(() => _repo.reject(_a!.id), finish: true);
  }

  @override
  Widget build(BuildContext context) {
    final a = _a;
    if (a == null) {
      return _loadError != null
          ? ErrorView(
              error: _loadError!,
              onRetry: () {
                setState(() => _loadError = null);
                unawaited(_load());
              },
            )
          : const LoadingView(message: 'Loading…');
    }
    if (a.status.isPending) return const _ReadingView();
    if (a.status == AnalysisStatus.failed) {
      return _Problem(
        icon: Icons.error_outline_rounded,
        title: 'We could not read this report',
        message: a.error ?? 'Something went wrong while reading your report.',
        actionLabel: 'Try again',
        busy: _busy,
        onAction: () => _run(() => _repo.retry(a.id)),
      );
    }
    if (a.status == AnalysisStatus.unsupported) {
      return _Problem(
        icon: Icons.block_rounded,
        title: 'This file type cannot be read',
        message:
            a.error ??
            'Scans such as DICOM images cannot be read automatically. Please upload the radiologist\'s written '
                'report or a clear photo of each page instead.',
      );
    }
    if (a.isConfirmed || a.isRejected) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (a.isRejected)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                'You discarded this reading. It is not used for screening or shared with hospitals.',
                style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
              ),
            ),
          ReportAnalysisCard(analysis: a),
          _ReportResultButton(analysisId: a.id),
        ],
      );
    }
    return _review(context, a);
  }

  Widget _review(BuildContext context, DocumentAnalysis a) {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.violetSoft,
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.fact_check_outlined, color: AppColors.violet),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Please check what the AI read. Correct anything that is wrong, then tap Confirm. '
                        'Only confirmed information is used.',
                        style: context.text.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
              if (!a.quality.legible || a.quality.issues.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  'Image quality: ${a.quality.issues.isEmpty ? 'parts may be hard to read' : a.quality.issues.join(', ')}. '
                  'A clearer photo gives better results.',
                  style: context.text.bodySmall?.copyWith(color: AppColors.warning),
                ),
              ],
              if (a.redFlags.isNotEmpty) ...[
                const SizedBox(height: 12),
                ReportAlertBanner(title: 'Please contact a doctor soon', lines: a.redFlags),
              ],
              ReportReviewForm(
                initial: a.data,
                aiOutput: a.aiOutput ?? a.data,
                enabled: !_busy,
                onChanged: (d) => _edited = d,
              ),
              const SizedBox(height: 16),
              Text(
                ReportStyle.disclaimer,
                textAlign: TextAlign.center,
                style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
              ),
              _ReportResultButton(analysisId: a.id),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: SecondaryButton(
                    label: 'Discard',
                    onPressed: _busy ? null : _discard,
                    foregroundColor: context.colors.onSurface,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: PrimaryButton(
                    label: 'Confirm',
                    icon: Icons.check_rounded,
                    loading: _busy,
                    onPressed: _busy ? null : _confirm,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// "Reading your report…" animation while the analysis is queued / processing.
class _ReadingView extends StatefulWidget {
  const _ReadingView();

  @override
  State<_ReadingView> createState() => _ReadingViewState();
}

class _ReadingViewState extends State<_ReadingView> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1600))
    ..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 120,
              height: 140,
              child: ExcludeSemantics(
                child: AnimatedBuilder(
                  animation: _c,
                  builder: (context, _) => CustomPaint(painter: _ScanPainter(_c.value)),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Semantics(
              liveRegion: true,
              child: Text(
                'Reading your report…',
                style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'This usually takes less than a minute. You will review everything before it is used.',
              textAlign: TextAlign.center,
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScanPainter extends CustomPainter {
  _ScanPainter(this.t);

  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final page = RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(12));
    canvas
      ..drawRRect(page, Paint()..color = AppColors.darkSurfaceAlt)
      ..drawRRect(
        page,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = AppColors.violet.withValues(alpha: 0.6),
      );
    final line = Paint()
      ..color = AppColors.darkTextMuted
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i < 7; i++) {
      final y = 24.0 + i * 15;
      final w = i.isEven ? size.width - 32 : size.width - 56;
      canvas.drawLine(Offset(16, y), Offset(16 + w, y), line);
    }
    final y = size.height * (0.5 - 0.5 * (1 - 2 * t).abs()) * 2;
    canvas.drawRect(
      Rect.fromLTWH(0, y - 10, size.width, 20),
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.primary.withValues(alpha: 0),
            AppColors.primary.withValues(alpha: 0.5),
            AppColors.primary.withValues(alpha: 0),
          ],
        ).createShader(Rect.fromLTWH(0, y - 10, size.width, 20)),
    );
  }

  @override
  bool shouldRepaint(_ScanPainter old) => old.t != t;
}

class _Problem extends StatelessWidget {
  const _Problem({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
    this.busy = false,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool busy;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 56, color: AppColors.danger),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
          ),
          if (actionLabel != null) ...[
            const SizedBox(height: 20),
            PrimaryButton(label: actionLabel!, loading: busy, onPressed: busy ? null : onAction, expand: false),
          ],
        ],
      ),
    ),
  );
}

/// "Report this result" for the AI reading (CG-16, `target_type` `document_analysis`).
class _ReportResultButton extends StatelessWidget {
  const _ReportResultButton({required this.analysisId});

  final String analysisId;

  @override
  Widget build(BuildContext context) {
    if (analysisId.isEmpty) return const SizedBox.shrink();
    return Center(
      child: TextButton.icon(
        key: const Key('report-document-analysis'),
        style: TextButton.styleFrom(foregroundColor: context.palette.textSecondary),
        onPressed: () => showReportSheet(context, type: ReportTargetType.documentAnalysis, targetId: analysisId),
        icon: const Icon(Icons.flag_outlined, size: 16),
        label: const Text('Report this result'),
      ),
    );
  }
}
