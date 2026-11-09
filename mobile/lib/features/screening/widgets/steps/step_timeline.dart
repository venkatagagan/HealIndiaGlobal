import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/models/models.dart';
import '../../../../core/repositories/document_repository.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../../l10n/l10n.dart';
import '../../../documents_ai/screens/report_capture_screen.dart';
import '../../providers/screening_draft.dart';
import '../screening_step_scaffold.dart';
import 'step_actions.dart';

/// Color of a severity level (mild yellow, moderate orange, severe red).
Color severityColor(SeverityLevel? l) => switch (l) {
  SeverityLevel.mild => const Color(0xFFFACC15),
  SeverityLevel.moderate => const Color(0xFFF97316),
  SeverityLevel.severe => AppColors.danger,
  _ => AppColors.darkTextMuted,
};

/// Picks a file for upload. Replaceable in tests.
typedef ReportPicker = Future<PlatformFile?> Function();

/// Default [ReportPicker] (PDF / images / DICOM).
Future<PlatformFile?> pickMedicalReport() =>
    FilePicker.pickFile(type: FileType.custom, allowedExtensions: DocumentRepository.allowedExtensions);

/// Step 3 - timeline: duration, daily-impact severity, previous treatments, optional reports.
class TimelineStep extends ScreeningStepView {
  const TimelineStep({super.key, required super.screeningId, this.picker = pickMedicalReport});

  final ReportPicker picker;

  @override
  ConsumerState<TimelineStep> createState() => _TimelineStepState();
}

class _Upload {
  _Upload(this.name);

  final String name;
  double progress = 0;
}

class _TimelineStepState extends ConsumerState<TimelineStep> with ScreeningStepActions {
  late final TextEditingController _value;
  late final TextEditingController _notes;
  final List<_Upload> _uploads = [];

  @override
  int get step => 3;

  @override
  void initState() {
    super.initState();
    final d = draft;
    _value = TextEditingController(text: d?.durationValue?.toString() ?? '');
    _notes = TextEditingController(text: d?.notes ?? '');
  }

  @override
  void dispose() {
    _value.dispose();
    _notes.dispose();
    super.dispose();
  }

  void _setValue(int? v) {
    final clamped = v?.clamp(1, 1000);
    edit((d) => clamped == null ? d.copyWith(clearDurationValue: true) : d.copyWith(durationValue: clamped));
    final text = clamped?.toString() ?? '';
    if (_value.text != text) {
      _value.value = TextEditingValue(
        text: text,
        selection: TextSelection.collapsed(offset: text.length),
      );
    }
  }

  /// Photo / PDF capture with AI reading + mandatory review (documents_ai, PLAN §7.1).
  Future<void> _scan() async {
    final d = draft;
    if (d == null) return;
    final room = kMaxScreeningReports - d.reports.length - _uploads.length;
    if (room <= 0) {
      showInfoSnack(context, context.l10n.screeningAttachLimit(kMaxScreeningReports));
      return;
    }
    final result = await context.push<ReportCaptureResult>(
      Routes.reportCaptureFor(screeningId: screeningId, kind: DocumentKind.medicalReport),
    );
    if (result == null || result.documents.isEmpty || !mounted) return;
    final l10n = context.l10n;
    final label = result.analysis?.effective.docType?.label ?? l10n.screeningReportDefaultLabel;
    final status = result.confirmed
        ? ' · ${l10n.screeningReportAiConfirmed}'
        : (result.analysis == null || result.analysis!.isRejected ? '' : ' · ${l10n.screeningReportAiToReview}');
    final docs = result.documents.take(room).toList();
    edit(
      (x) => x.copyWith(
        reports: [
          ...x.reports,
          for (final (i, doc) in docs.indexed)
            ScreeningReport(
              id: doc.id,
              name: docs.length == 1 ? '$label$status' : '${l10n.screeningReportPage(label, i + 1)}$status',
            ),
        ],
      ),
    );
    if (docs.length < result.documents.length) {
      showInfoSnack(context, l10n.screeningAttachPagesLimit(kMaxScreeningReports));
    }
  }

  Future<void> _upload() async {
    final d = draft;
    if (d == null) return;
    if (d.reports.length + _uploads.length >= kMaxScreeningReports) {
      showInfoSnack(context, context.l10n.screeningAttachLimit(kMaxScreeningReports));
      return;
    }
    final PlatformFile? file;
    try {
      file = await widget.picker();
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
      return;
    }
    if (file == null || !mounted) return;
    final up = _Upload(file.name);
    setState(() => _uploads.add(up));
    try {
      final path = file.path;
      final doc = await ref
          .read(documentRepositoryProvider)
          .upload(
            fileName: file.name,
            kind: DocumentKind.medicalReport,
            filePath: path,
            bytes: path == null ? await file.readAsBytes() : null,
            onProgress: (sent, total) {
              if (mounted && total > 0) setState(() => up.progress = sent / total);
            },
          );
      edit(
        (x) => x.copyWith(
          reports: [
            ...x.reports,
            ScreeningReport(id: doc.id, name: doc.fileName),
          ],
        ),
      );
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _uploads.remove(up));
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(screeningDraftProvider(screeningId)).requireValue;
    final l10n = context.l10n;
    return ScreeningStepScaffold(
      step: step,
      title: l10n.screeningStep3Title,
      titleAlign: TextAlign.start,
      primaryLabel: l10n.commonNext,
      busy: busy || _uploads.isNotEmpty,
      onPrimary: goNext,
      onBack: goPrevious,
      onSaveExit: saveAndExit,
      children: [
        ChipToggleGroup<DurationUnit>(
          options: DurationUnit.values,
          selected: {d.durationUnit},
          labelOf: (u) => u.label,
          onChanged: (s) => edit((x) => x.copyWith(durationUnit: s.first)),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            IconButton.filledTonal(
              tooltip: l10n.screeningDecrease,
              onPressed: (d.durationValue ?? 0) > 1 ? () => _setValue(d.durationValue! - 1) : null,
              icon: const Icon(Icons.remove_rounded),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 88,
              child: TextField(
                key: const ValueKey('duration-value'),
                controller: _value,
                textAlign: TextAlign.center,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
                decoration: const InputDecoration(hintText: '0', isDense: true),
                onChanged: (t) => _setValue(int.tryParse(t)),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filledTonal(
              tooltip: l10n.screeningIncrease,
              onPressed: () => _setValue((d.durationValue ?? 0) + 1),
              icon: const Icon(Icons.add_rounded),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                d.durationUnit.label.toLowerCase(),
                style: context.text.bodyLarge?.copyWith(color: context.palette.textSecondary),
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        Text(l10n.screeningSeverity, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 2),
        Text(l10n.screeningDailyImpact, style: context.text.titleSmall?.copyWith(color: context.palette.textSecondary)),
        const SizedBox(height: 10),
        _SeverityRow(
          icon: Icons.work_outline_rounded,
          title: l10n.screeningImpactWork,
          subtitle: l10n.screeningImpactWorkQuestion,
          value: d.severity.work,
          onChanged: (v) => edit((x) => x.copyWith(severity: _withSeverity(x.severity, work: v))),
        ),
        _SeverityRow(
          icon: Icons.bedtime_outlined,
          title: l10n.screeningImpactSleep,
          subtitle: l10n.screeningImpactSleepQuestion,
          value: d.severity.sleep,
          onChanged: (v) => edit((x) => x.copyWith(severity: _withSeverity(x.severity, sleep: v))),
        ),
        _SeverityRow(
          icon: Icons.accessible_forward_rounded,
          title: l10n.screeningImpactMobility,
          subtitle: l10n.screeningImpactMobilityQuestion,
          value: d.severity.mobility,
          onChanged: (v) => edit((x) => x.copyWith(severity: _withSeverity(x.severity, mobility: v))),
        ),
        const SizedBox(height: 16),
        Text(l10n.screeningPreviousTreatments, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        for (final t in PreviousTreatment.values)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: context.colors.surfaceContainer,
              borderRadius: BorderRadius.circular(AppRadius.md),
              clipBehavior: Clip.antiAlias,
              child: CheckboxListTile(
                value: d.previousTreatments.contains(t.json),
                controlAffinity: ListTileControlAffinity.leading,
                activeColor: AppColors.primary,
                title: Text(t.label, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
                onChanged: (on) => edit((x) {
                  final next = {...x.previousTreatments};
                  on == true ? next.add(t.json) : next.remove(t.json);
                  return x.copyWith(previousTreatments: next);
                }),
              ),
            ),
          ),
        const SizedBox(height: 16),
        Text.rich(
          TextSpan(
            text: '${l10n.screeningPreviousReports} ',
            children: [
              TextSpan(
                text: l10n.screeningOptionalParen,
                style: TextStyle(color: context.palette.textSecondary, fontWeight: FontWeight.w400),
              ),
            ],
          ),
          style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        _UploadBox(onTap: busy ? null : _scan),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton.icon(
            key: const ValueKey('report-plain-upload'),
            onPressed: busy ? null : _upload,
            icon: const Icon(Icons.attach_file_rounded, size: 18),
            label: Text(l10n.screeningAttachWithoutAi),
          ),
        ),
        for (final r in d.reports)
          _ReportTile(
            name: r.name,
            onRemove: () => edit(
              (x) => x.copyWith(
                reports: [
                  for (final o in x.reports)
                    if (o.id != r.id) o,
                ],
              ),
            ),
          ),
        for (final u in _uploads) _ReportTile(name: u.name, progress: u.progress),
        const SizedBox(height: 16),
        TextField(
          controller: _notes,
          maxLines: 3,
          maxLength: 4000,
          onChanged: (t) => edit((x) => x.copyWith(notes: t)),
          decoration: InputDecoration(labelText: l10n.screeningNotesLabel, alignLabelWithHint: true),
        ),
      ],
    );
  }

  static ScreeningSeverity _withSeverity(
    ScreeningSeverity s, {
    SeverityLevel? work,
    SeverityLevel? sleep,
    SeverityLevel? mobility,
  }) => ScreeningSeverity(work: work ?? s.work, sleep: sleep ?? s.sleep, mobility: mobility ?? s.mobility);
}

class _SeverityRow extends StatelessWidget {
  const _SeverityRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final SeverityLevel? value;
  final ValueChanged<SeverityLevel> onChanged;

  static const _levels = [SeverityLevel.mild, SeverityLevel.moderate, SeverityLevel.severe];

  @override
  Widget build(BuildContext context) {
    final c = severityColor(value);
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(color: context.palette.surfaceAlt, shape: BoxShape.circle),
                child: Icon(icon, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                    Text(subtitle, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
                  ],
                ),
              ),
              if (value != null && value != SeverityLevel.none) ...[
                Icon(Icons.circle, size: 9, color: c),
                const SizedBox(width: 4),
                Text(
                  value!.label,
                  style: context.text.labelMedium?.copyWith(color: c, fontWeight: FontWeight.w700),
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (final l in _levels) ...[
                Expanded(
                  child: _LevelPill(
                    label: context.l10n.screeningSeverityPillSemantics(title, l.label),
                    text: l.label,
                    color: severityColor(l),
                    selected: value == l,
                    onTap: () => onChanged(l),
                  ),
                ),
                if (l != SeverityLevel.severe) const SizedBox(width: 8),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _LevelPill extends StatelessWidget {
  const _LevelPill({
    required this.label,
    required this.text,
    required this.color,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final String text;
  final Color color;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: label,
      button: true,
      selected: selected,
      excludeSemantics: true,
      child: Material(
        color: selected ? color.withValues(alpha: 0.22) : context.palette.surfaceAlt,
        shape: StadiumBorder(side: BorderSide(color: selected ? color : Colors.transparent, width: 1.4)),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Center(
              child: Text(
                text,
                style: context.text.labelMedium?.copyWith(
                  color: selected ? color : context.palette.textSecondary,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _UploadBox extends StatelessWidget {
  const _UploadBox({required this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Semantics(
      button: true,
      label: l10n.screeningScanUpload,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: CustomPaint(
          painter: _DashedBorderPainter(color: context.palette.border),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 16),
            child: Column(
              children: [
                const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.photo_camera_outlined, size: 30, color: AppColors.primary),
                    SizedBox(width: 12),
                    Icon(Icons.cloud_upload_outlined, size: 30, color: AppColors.primary),
                  ],
                ),
                const SizedBox(height: 8),
                Text(l10n.screeningScanUpload, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(
                  l10n.screeningScanUploadHint,
                  textAlign: TextAlign.center,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ReportTile extends StatelessWidget {
  const _ReportTile({required this.name, this.onRemove, this.progress});

  final String name;
  final VoidCallback? onRemove;

  /// Non-null while uploading.
  final double? progress;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: AppCard(
        padding: const EdgeInsetsDirectional.fromSTEB(12, 8, 4, 8),
        child: Row(
          children: [
            const Icon(Icons.description_outlined, color: AppColors.primary),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.text.bodyMedium),
                  if (progress != null) ...[
                    const SizedBox(height: 6),
                    LinearProgressIndicator(value: progress == 0 ? null : progress, minHeight: 4),
                  ],
                ],
              ),
            ),
            if (progress == null && onRemove != null)
              IconButton(
                tooltip: context.l10n.screeningRemoveReportTooltip(name),
                icon: const Icon(Icons.close_rounded),
                onPressed: onRemove,
              )
            else
              const SizedBox(width: 12),
          ],
        ),
      ),
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  _DashedBorderPainter({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    final path = Path()..addRRect(RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(AppRadius.md)));
    for (final metric in path.computeMetrics()) {
      var d = 0.0;
      while (d < metric.length) {
        canvas.drawPath(metric.extractPath(d, d + 6), paint);
        d += 11;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter oldDelegate) => oldDelegate.color != color;
}
