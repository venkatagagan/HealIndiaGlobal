import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../data/document_analysis_repository.dart';
import '../data/report_page_source.dart';
import '../models/document_analysis.dart';
import '../widgets/report_analysis_view.dart';

/// Result of the capture flow (`context.push<ReportCaptureResult>(Routes.reportCapture(...))`).
class ReportCaptureResult {
  const ReportCaptureResult({required this.documents, this.analysis});

  /// Uploaded pages, in page order.
  final List<AppDocument> documents;

  /// The AI analysis (null when the patient chose not to use AI). Only a `confirmed` analysis is
  /// used downstream.
  final DocumentAnalysis? analysis;

  bool get confirmed => analysis?.isConfirmed ?? false;
}

/// Document kinds offered for a medical report.
const kReportKinds = [
  DocumentKind.medicalReport,
  DocumentKind.labResult,
  DocumentKind.imaging,
  DocumentKind.prescription,
  DocumentKind.other,
];

/// `/reports/capture?caseId=&screeningId=&kind=` — photograph a paper report (multi-page) or pick a
/// PDF, upload, let the AI read it, then review → edit → confirm inline (PLAN §7.1).
///
/// Pops with a [ReportCaptureResult] (also when leaving while the AI is still reading).
class ReportCaptureScreen extends ConsumerStatefulWidget {
  const ReportCaptureScreen({super.key, this.caseId, this.screeningId, this.kind});

  final String? caseId;
  final String? screeningId;
  final DocumentKind? kind;

  @override
  ConsumerState<ReportCaptureScreen> createState() => _ReportCaptureScreenState();
}

class _ReportCaptureScreenState extends ConsumerState<ReportCaptureScreen> {
  final List<ReportPage> _pages = [];
  final Map<int, AppDocument> _uploaded = {};
  late DocumentKind _kind = kReportKinds.contains(widget.kind) ? widget.kind! : DocumentKind.medicalReport;
  bool _consentAi = true;
  bool _busy = false;
  double? _progress;
  String? _status;
  DocumentAnalysis? _analysis;

  int get _max => DocumentAnalysisRepository.maxPages;

  List<AppDocument> get _docs => [
    for (final p in _pages)
      if (_uploaded[p.id] != null) _uploaded[p.id]!,
  ];

  Future<void> _add(Future<List<ReportPage>> Function(ReportPageSource s) pick) async {
    if (_pages.length >= _max) {
      showInfoSnack(context, context.l10n.reportMaxPages(_max));
      return;
    }
    try {
      final picked = await pick(ref.read(reportPageSourceProvider));
      if (!mounted || picked.isEmpty) return;
      final tooBig = picked.where((p) => (p.bytes?.length ?? 0) > DocumentRepository.maxUploadBytes);
      if (tooBig.isNotEmpty) showInfoSnack(context, context.l10n.reportFileTooLarge(tooBig.first.name));
      setState(() => _pages.addAll(picked.where((p) => !tooBig.contains(p)).take(_max - _pages.length)));
    } catch (e) {
      if (mounted) {
        showErrorSnack(
          context,
          '$e'.contains('denied') || '$e'.contains('permission') ? context.l10n.reportPermissionNeeded : e,
        );
      }
    }
  }

  Future<void> _submit() async {
    if (_pages.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _progress = 0;
    });
    final docs = ref.read(documentRepositoryProvider);
    final l10n = context.l10n;
    try {
      for (final (i, p) in _pages.indexed) {
        if (_uploaded.containsKey(p.id)) continue;
        setState(() => _status = l10n.reportUploadingPage(i + 1, _pages.length));
        final doc = await docs.upload(
          fileName: p.name,
          kind: _kind,
          filePath: p.path,
          bytes: p.path == null ? p.bytes : null,
          caseId: widget.caseId,
          onProgress: (sent, total) {
            if (mounted && total > 0) setState(() => _progress = (i + sent / total) / _pages.length);
          },
        );
        _uploaded[p.id] = doc;
      }
      if (!mounted) return;
      if (!_consentAi) {
        Navigator.of(context).pop(ReportCaptureResult(documents: _docs));
        return;
      }
      setState(() {
        _status = l10n.reportSendingToAi;
        _progress = null;
      });
      final analysis = await ref
          .read(documentAnalysisRepositoryProvider)
          .create(documentIds: [for (final d in _docs) d.id], caseId: widget.caseId);
      if (mounted) setState(() => _analysis = analysis);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _status = null;
          _progress = null;
        });
      }
    }
  }

  void _finish(DocumentAnalysis a) => Navigator.of(context).pop(ReportCaptureResult(documents: _docs, analysis: a));

  @override
  Widget build(BuildContext context) {
    final analysis = _analysis;
    final l10n = context.l10n;
    if (analysis != null) {
      return PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _finish(analysis);
        },
        child: Scaffold(
          appBar: AppBar(title: Text(l10n.reportReviewTitle)),
          body: ReportAnalysisView(analysisId: analysis.id, initial: analysis, onFinished: _finish),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(l10n.reportCaptureTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(l10n.reportCaptureIntro, style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary)),
          const SizedBox(height: 16),
          Row(
            children: [
              _SourceTile(
                icon: Icons.photo_camera_rounded,
                label: l10n.reportTakePhoto,
                color: AppColors.primary,
                onTap: _busy
                    ? null
                    : () => _add((s) async {
                        final p = await s.takePhoto();
                        return p == null ? const [] : [p];
                      }),
              ),
              const SizedBox(width: 10),
              _SourceTile(
                icon: Icons.photo_library_rounded,
                label: l10n.reportChooseFromGallery,
                color: AppColors.violet,
                onTap: _busy ? null : () => _add((s) => s.pickPhotos(limit: _max - _pages.length)),
              ),
              const SizedBox(width: 10),
              _SourceTile(
                icon: Icons.picture_as_pdf_rounded,
                label: l10n.reportUploadPdf,
                color: AppColors.danger,
                onTap: _busy
                    ? null
                    : () => _add((s) async {
                        final p = await s.pickPdf();
                        return p == null ? const [] : [p];
                      }),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            l10n.reportPagesCount(_pages.length, _max),
            style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          if (_pages.isEmpty)
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: context.palette.surfaceAlt,
                borderRadius: BorderRadius.circular(AppRadius.md),
              ),
              child: Text(
                l10n.reportNoPagesTip,
                textAlign: TextAlign.center,
                style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
              ),
            )
          else
            ReorderableListView(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              buildDefaultDragHandles: false,
              onReorderItem: (from, to) => setState(() => _pages.insert(to, _pages.removeAt(from))),
              children: [
                for (final (i, p) in _pages.indexed)
                  _PageTile(
                    key: ValueKey(p.id),
                    index: i,
                    page: p,
                    uploaded: _uploaded.containsKey(p.id),
                    onRemove: _busy || _uploaded.containsKey(p.id) ? null : () => setState(() => _pages.remove(p)),
                  ),
              ],
            ),
          const SizedBox(height: 20),
          Text(l10n.reportKindQuestion, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final k in kReportKinds)
                ChipToggle(
                  label: k.label,
                  selected: _kind == k,
                  onChanged: _busy || _uploaded.isNotEmpty ? null : (_) => setState(() => _kind = k),
                ),
            ],
          ),
          const SizedBox(height: 20),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SwitchListTile(
                  key: const ValueKey('report-ai-consent'),
                  contentPadding: EdgeInsets.zero,
                  value: _consentAi,
                  activeThumbColor: AppColors.primary,
                  onChanged: _busy ? null : (v) => setState(() => _consentAi = v),
                  title: Text(l10n.reportReadWithAi, style: context.text.titleSmall),
                ),
                Text(
                  l10n.reportAiConsentText,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_status != null) ...[
                Text(_status!, style: context.text.bodySmall),
                const SizedBox(height: 6),
                LinearProgressIndicator(value: _progress, color: AppColors.primary),
                const SizedBox(height: 10),
              ],
              PrimaryButton(
                label: _consentAi ? l10n.reportReadWithAi : l10n.reportUploadButton,
                icon: _consentAi ? Icons.auto_awesome_rounded : Icons.cloud_upload_outlined,
                loading: _busy,
                onPressed: _pages.isEmpty || _busy ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SourceTile extends StatelessWidget {
  const _SourceTile({required this.icon, required this.label, required this.color, required this.onTap});

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Expanded(
    child: Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: AppCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
        child: Column(
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: color.withValues(alpha: 0.18),
              child: Icon(icon, color: color),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              style: context.text.labelMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    ),
  );
}

class _PageTile extends StatelessWidget {
  const _PageTile({super.key, required this.index, required this.page, required this.uploaded, this.onRemove});

  final int index;
  final ReportPage page;
  final bool uploaded;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final thumb = page.thumbnail;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: context.palette.surfaceAlt, borderRadius: BorderRadius.circular(AppRadius.md)),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.sm),
            child: SizedBox(
              width: 48,
              height: 60,
              child: thumb != null
                  ? Image.memory(thumb, fit: BoxFit.cover, cacheWidth: 144)
                  : ColoredBox(
                      color: AppColors.dangerSoft,
                      child: Icon(
                        page.isPdf ? Icons.picture_as_pdf_rounded : Icons.image_outlined,
                        color: AppColors.danger,
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.l10n.reportPageNumber(index + 1),
                  style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                Text(
                  page.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              ],
            ),
          ),
          if (uploaded) const Icon(Icons.cloud_done_rounded, color: AppColors.primary, size: 20),
          IconButton(
            tooltip: context.l10n.reportRemovePage(index + 1),
            onPressed: onRemove,
            icon: const Icon(Icons.delete_outline_rounded),
          ),
          ReorderableDragStartListener(
            index: index,
            child: Tooltip(
              message: context.l10n.reportDragToReorder,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Icon(Icons.drag_handle_rounded, color: context.palette.textMuted),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
