import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/theme/app_theme.dart';
import '../models/document_analysis.dart';
import 'report_style.dart';

/// A list row with a stable key (so text fields keep their state while rows are added / removed).
class _Row<T> {
  _Row(this.value) : key = UniqueKey();

  final Key key;
  T value;
}

/// Editable review form of an AI extraction (PLAN §7.1 "review → edit → confirm").
///
/// Emits the full edited [ReportData] through [onChanged] after every change. [aiOutput] (when
/// given) is used to show "Edited" markers next to the sections the patient changed.
class ReportReviewForm extends StatefulWidget {
  const ReportReviewForm({
    super.key,
    required this.initial,
    required this.onChanged,
    this.aiOutput,
    this.enabled = true,
  });

  final ReportData initial;
  final ReportData? aiOutput;
  final ValueChanged<ReportData> onChanged;
  final bool enabled;

  @override
  State<ReportReviewForm> createState() => _ReportReviewFormState();
}

class _ReportReviewFormState extends State<ReportReviewForm> {
  late ReportDocType? _docType = widget.initial.docType;
  late DateTime? _date = widget.initial.reportDate;
  late String _facility = widget.initial.facilityName;
  late String _summary = widget.initial.summaryPatient;
  late final _findings = [for (final f in widget.initial.keyFindings) _Row(f)];
  late final _labs = [for (final v in widget.initial.labValues) _Row(v)];
  late final _meds = [for (final m in widget.initial.medications) _Row(m)];
  late final _diagnoses = [for (final s in widget.initial.diagnoses) _Row(s)];
  late final _procedures = [for (final s in widget.initial.procedures) _Row(s)];
  late final _recommendations = [for (final s in widget.initial.recommendations) _Row(s)];

  ReportData get _data => ReportData(
    docType: _docType,
    reportDate: _date,
    facilityName: _facility,
    summaryPatient: _summary,
    keyFindings: [for (final r in _findings) r.value],
    labValues: [for (final r in _labs) r.value],
    medications: [for (final r in _meds) r.value],
    diagnoses: [for (final r in _diagnoses) r.value],
    procedures: [for (final r in _procedures) r.value],
    recommendations: [for (final r in _recommendations) r.value],
  );

  void _changed([VoidCallback? fn]) {
    setState(fn ?? () {});
    widget.onChanged(_data);
  }

  bool _edited(String key) {
    final ai = widget.aiOutput;
    return ai != null && _data.cleaned().diffKeys(ai).contains(key);
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? now,
      firstDate: DateTime(1950),
      lastDate: now,
      helpText: 'Report date',
    );
    if (picked != null) _changed(() => _date = picked);
  }

  @override
  Widget build(BuildContext context) {
    final on = widget.enabled;
    final critical = _labs.where((r) => r.value.flag == LabFlag.critical).map((r) => r.value).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (critical.isNotEmpty) ...[
          ReportAlertBanner(
            title: 'Critical values in this report',
            lines: [for (final v in critical) '${v.test}: ${v.value} ${v.unit}'.trim()],
          ),
          const SizedBox(height: 8),
        ],
        ReportSectionHeader(
          'About this report',
          edited: _edited('doc_type') || _edited('report_date') || _edited('facility_name'),
        ),
        DropdownButtonFormField<ReportDocType>(
          key: const ValueKey('report-doc-type'),
          initialValue: _docType,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Document type'),
          items: [for (final t in ReportDocType.values) DropdownMenuItem(value: t, child: Text(t.label))],
          onChanged: on ? (v) => _changed(() => _docType = v) : null,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: InkWell(
                onTap: on ? _pickDate : null,
                borderRadius: BorderRadius.circular(AppRadius.md),
                child: InputDecorator(
                  decoration: InputDecoration(
                    labelText: 'Report date',
                    suffixIcon: _date == null || !on
                        ? const Icon(Icons.event_rounded)
                        : IconButton(
                            tooltip: 'Clear date',
                            icon: const Icon(Icons.close_rounded),
                            onPressed: () => _changed(() => _date = null),
                          ),
                  ),
                  child: Text(_date == null ? 'Not stated' : DateFormat.yMMMd().format(_date!)),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextFormField(
          key: const ValueKey('report-facility'),
          initialValue: _facility,
          enabled: on,
          decoration: const InputDecoration(labelText: 'Hospital / laboratory'),
          onChanged: (v) => _changed(() => _facility = v),
        ),
        ReportSectionHeader('Summary', edited: _edited('summary_patient')),
        TextFormField(
          key: const ValueKey('report-summary'),
          initialValue: _summary,
          enabled: on,
          minLines: 3,
          maxLines: 8,
          decoration: const InputDecoration(hintText: 'What the report says, in plain words'),
          onChanged: (v) => _changed(() => _summary = v),
        ),
        ReportSectionHeader(
          'Key findings',
          edited: _edited('key_findings'),
          trailing: _AddButton(
            label: 'Add finding',
            onPressed: on ? () => _changed(() => _findings.add(_Row(const KeyFinding(finding: '')))) : null,
          ),
        ),
        for (final (i, r) in _findings.indexed)
          _RowCard(
            key: r.key,
            onRemove: on ? () => _changed(() => _findings.remove(r)) : null,
            removeLabel: 'Remove finding ${i + 1}',
            children: [
              TextFormField(
                key: ValueKey('finding-$i'),
                initialValue: r.value.finding,
                enabled: on,
                maxLines: null,
                decoration: const InputDecoration(labelText: 'Finding', isDense: true),
                onChanged: (v) => _changed(() => r.value = r.value.copyWith(finding: v)),
              ),
              const SizedBox(height: 8),
              _EnumChips<FindingSignificance>(
                values: FindingSignificance.values,
                selected: r.value.significance,
                label: (s) => s.label,
                color: ReportStyle.significance,
                onSelected: on ? (s) => _changed(() => r.value = r.value.copyWith(significance: s)) : null,
              ),
            ],
          ),
        ReportSectionHeader(
          'Lab values',
          edited: _edited('lab_values'),
          trailing: _AddButton(
            label: 'Add value',
            onPressed: on ? () => _changed(() => _labs.add(_Row(const LabValue(test: '')))) : null,
          ),
        ),
        for (final (i, r) in _labs.indexed)
          _RowCard(
            key: r.key,
            accent: ReportStyle.labFlag(r.value.flag),
            onRemove: on ? () => _changed(() => _labs.remove(r)) : null,
            removeLabel: 'Remove lab value ${i + 1}',
            children: [
              TextFormField(
                key: ValueKey('lab-test-$i'),
                initialValue: r.value.test,
                enabled: on,
                decoration: const InputDecoration(labelText: 'Test', isDense: true),
                onChanged: (v) => _changed(() => r.value = r.value.copyWith(test: v)),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      key: ValueKey('lab-value-$i'),
                      initialValue: r.value.value,
                      enabled: on,
                      decoration: const InputDecoration(labelText: 'Value', isDense: true),
                      onChanged: (v) => _changed(() => r.value = r.value.copyWith(value: v)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextFormField(
                      initialValue: r.value.unit,
                      enabled: on,
                      decoration: const InputDecoration(labelText: 'Unit', isDense: true),
                      onChanged: (v) => _changed(() => r.value = r.value.copyWith(unit: v)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextFormField(
                initialValue: r.value.referenceRange,
                enabled: on,
                decoration: const InputDecoration(labelText: 'Reference range', isDense: true),
                onChanged: (v) => _changed(() => r.value = r.value.copyWith(referenceRange: v)),
              ),
              const SizedBox(height: 8),
              _EnumChips<LabFlag>(
                values: LabFlag.values,
                selected: r.value.flag,
                label: (f) => f.label,
                color: ReportStyle.labFlag,
                onSelected: on ? (f) => _changed(() => r.value = r.value.copyWith(flag: f)) : null,
              ),
            ],
          ),
        ReportSectionHeader(
          'Medications',
          edited: _edited('medications'),
          trailing: _AddButton(
            label: 'Add medication',
            onPressed: on ? () => _changed(() => _meds.add(_Row(const ReportMedication(name: '')))) : null,
          ),
        ),
        for (final (i, r) in _meds.indexed)
          _RowCard(
            key: r.key,
            onRemove: on ? () => _changed(() => _meds.remove(r)) : null,
            removeLabel: 'Remove medication ${i + 1}',
            children: [
              TextFormField(
                key: ValueKey('med-name-$i'),
                initialValue: r.value.name,
                enabled: on,
                decoration: const InputDecoration(labelText: 'Medicine', isDense: true),
                onChanged: (v) => _changed(() => r.value = r.value.copyWith(name: v)),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      initialValue: r.value.dose,
                      enabled: on,
                      decoration: const InputDecoration(labelText: 'Dose', isDense: true),
                      onChanged: (v) => _changed(() => r.value = r.value.copyWith(dose: v)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextFormField(
                      initialValue: r.value.frequency,
                      enabled: on,
                      decoration: const InputDecoration(labelText: 'How often', isDense: true),
                      onChanged: (v) => _changed(() => r.value = r.value.copyWith(frequency: v)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ..._stringSection('Diagnoses mentioned', 'diagnoses_mentioned', 'Add diagnosis', _diagnoses, on),
        ..._stringSection('Procedures mentioned', 'procedures_mentioned', 'Add procedure', _procedures, on),
        ..._stringSection('Recommendations', 'recommendations', 'Add recommendation', _recommendations, on),
      ],
    );
  }

  List<Widget> _stringSection(String title, String key, String addLabel, List<_Row<String>> rows, bool on) => [
    ReportSectionHeader(
      title,
      edited: _edited(key),
      trailing: _AddButton(label: addLabel, onPressed: on ? () => _changed(() => rows.add(_Row(''))) : null),
    ),
    for (final (i, r) in rows.indexed)
      Padding(
        key: r.key,
        padding: const EdgeInsets.only(bottom: 8),
        child: TextFormField(
          key: ValueKey('$key-$i'),
          initialValue: r.value,
          enabled: on,
          decoration: InputDecoration(
            isDense: true,
            suffixIcon: on
                ? IconButton(
                    tooltip: 'Remove',
                    icon: const Icon(Icons.close_rounded, size: 18),
                    onPressed: () => _changed(() => rows.remove(r)),
                  )
                : null,
          ),
          onChanged: (v) => _changed(() => r.value = v),
        ),
      ),
    if (rows.isEmpty) Text('None', style: context.text.bodySmall?.copyWith(color: context.palette.textMuted)),
  ];
}

class _AddButton extends StatelessWidget {
  const _AddButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => TextButton.icon(
    onPressed: onPressed,
    style: TextButton.styleFrom(foregroundColor: AppColors.primary, visualDensity: VisualDensity.compact),
    icon: const Icon(Icons.add_rounded, size: 18),
    label: Text(label),
  );
}

class _RowCard extends StatelessWidget {
  const _RowCard({super.key, required this.children, this.onRemove, this.removeLabel = 'Remove', this.accent});

  final List<Widget> children;
  final VoidCallback? onRemove;
  final String removeLabel;
  final Color? accent;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.fromLTRB(12, 10, 4, 12),
    decoration: BoxDecoration(
      color: context.palette.surfaceAlt,
      borderRadius: BorderRadius.circular(AppRadius.md),
      border: Border(left: BorderSide(color: accent ?? context.palette.border, width: 4)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
        ),
        IconButton(tooltip: removeLabel, onPressed: onRemove, icon: const Icon(Icons.delete_outline_rounded)),
      ],
    ),
  );
}

class _EnumChips<T> extends StatelessWidget {
  const _EnumChips({
    required this.values,
    required this.selected,
    required this.label,
    required this.color,
    required this.onSelected,
  });

  final List<T> values;
  final T selected;
  final String Function(T) label;
  final Color Function(T) color;
  final ValueChanged<T>? onSelected;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: 6,
    runSpacing: 6,
    children: [
      for (final v in values)
        ChoiceChip(
          label: Text(label(v)),
          selected: v == selected,
          visualDensity: VisualDensity.compact,
          selectedColor: color(v).withValues(alpha: 0.25),
          side: BorderSide(color: v == selected ? color(v) : context.palette.border),
          labelStyle: context.text.labelSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: v == selected ? color(v) : context.palette.textSecondary,
          ),
          onSelected: onSelected == null ? null : (_) => onSelected!(v),
        ),
    ],
  );
}
