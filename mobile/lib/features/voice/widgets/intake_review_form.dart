import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../screening/widgets/body_map.dart';
import '../../screening/widgets/pain_slider.dart';
import '../models/voice_models.dart';

/// Editable review form of an [IntakeSuggestion] (PLAN §7.2): specialty, body areas, pain,
/// symptoms (no / maybe / yes), duration, daily impact, previous treatments and notes.
///
/// Emits the full edited suggestion through [onChanged] after every change.
class IntakeReviewForm extends ConsumerStatefulWidget {
  const IntakeReviewForm({super.key, required this.initial, required this.onChanged, this.enabled = true});

  final IntakeSuggestion initial;
  final ValueChanged<IntakeSuggestion> onChanged;
  final bool enabled;

  @override
  ConsumerState<IntakeReviewForm> createState() => _IntakeReviewFormState();
}

class _IntakeReviewFormState extends ConsumerState<IntakeReviewForm> {
  late IntakeSuggestion _v = widget.initial;
  final _newSymptom = TextEditingController();

  @override
  void dispose() {
    _newSymptom.dispose();
    super.dispose();
  }

  void _set(IntakeSuggestion next) {
    setState(() => _v = next);
    widget.onChanged(next);
  }

  void _addSymptom() {
    final name = _newSymptom.text.trim();
    if (name.isEmpty) return;
    final key = name.toLowerCase();
    _newSymptom.clear();
    _set(
      _v.copyWith(
        symptoms: [
          for (final s in _v.symptoms)
            if (s.name.toLowerCase() != key) s,
          SymptomResponse(name: name.length > 120 ? name.substring(0, 120) : name, answer: SymptomAnswer.yes),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final on = widget.enabled;
    final specialties = ref.watch(specialtiesProvider).value ?? const <Specialty>[];
    final slugs = {for (final s in specialties) s.slug};
    final severity = _v.severity ?? const ScreeningSeverity();
    final sectionStyle = context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800);
    Widget section(String title) => Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 8),
      child: Semantics(header: true, child: Text(title, style: sectionStyle)),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        section('Medical area'),
        DropdownButtonFormField<String?>(
          key: const ValueKey('intake-specialty'),
          initialValue: slugs.contains(_v.specialtySlug) ? _v.specialtySlug : null,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Specialty (optional)'),
          items: [
            const DropdownMenuItem<String?>(child: Text('Not sure')),
            for (final s in specialties) DropdownMenuItem<String?>(value: s.slug, child: Text(s.name)),
          ],
          onChanged: on ? (v) => _set(_v.copyWith(specialtySlug: v, clearSpecialty: v == null)) : null,
        ),
        section('Where is the problem?'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final r in BodyRegion.values)
              ChipToggle(
                label: r.label,
                selected: _v.bodyAreas.contains(r.json),
                selectedColor: AppColors.danger,
                onChanged: on
                    ? (sel) => _set(
                        _v.copyWith(
                          bodyAreas: sel
                              ? [..._v.bodyAreas, r.json]
                              : [
                                  for (final a in _v.bodyAreas)
                                    if (a != r.json) a,
                                ],
                        ),
                      )
                    : null,
              ),
          ],
        ),
        const SizedBox(height: 16),
        if (_v.painIntensity == null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: on ? () => _set(_v.copyWith(painIntensity: 5)) : null,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add pain intensity'),
            ),
          )
        else
          IgnorePointer(
            ignoring: !on,
            child: PainSlider(
              value: _v.painIntensity!,
              onChanged: (p) => _set(_v.copyWith(painIntensity: p)),
            ),
          ),
        section('Symptoms'),
        for (final s in _v.symptoms)
          _SymptomRow(
            key: ValueKey('intake-symptom-${s.name.toLowerCase()}'),
            symptom: s,
            onAnswer: on
                ? (a) => _set(
                    _v.copyWith(
                      symptoms: [
                        for (final x in _v.symptoms) x.name == s.name ? SymptomResponse(name: x.name, answer: a) : x,
                      ],
                    ),
                  )
                : null,
            onRemove: on
                ? () => _set(
                    _v.copyWith(
                      symptoms: [
                        for (final x in _v.symptoms)
                          if (x.name != s.name) x,
                      ],
                    ),
                  )
                : null,
          ),
        Row(
          children: [
            Expanded(
              child: TextField(
                key: const ValueKey('intake-new-symptom'),
                controller: _newSymptom,
                enabled: on,
                maxLength: 120,
                decoration: const InputDecoration(hintText: 'Add a symptom', counterText: '', isDense: true),
                onSubmitted: (_) => _addSymptom(),
              ),
            ),
            IconButton(
              tooltip: 'Add symptom',
              onPressed: on ? _addSymptom : null,
              icon: const Icon(Icons.add_circle_rounded, color: AppColors.primary),
            ),
          ],
        ),
        section('How long have you had it?'),
        Row(
          children: [
            SizedBox(
              width: 90,
              child: TextFormField(
                key: const ValueKey('intake-duration'),
                initialValue: _v.durationValue?.toString() ?? '',
                enabled: on,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(isDense: true, hintText: '0'),
                onChanged: (t) {
                  final n = int.tryParse(t.trim());
                  _set(
                    n == null || n < 0 || n > 1000
                        ? _v.copyWith(clearDuration: true)
                        : _v.copyWith(durationValue: n, durationUnit: _v.durationUnit ?? DurationUnit.weeks),
                  );
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final u in DurationUnit.values)
                    ChipToggle(
                      label: u.label,
                      selected: _v.durationUnit == u,
                      onChanged: on ? (_) => _set(_v.copyWith(durationUnit: u)) : null,
                    ),
                ],
              ),
            ),
          ],
        ),
        section('Daily impact'),
        for (final (label, value, apply) in [
          ('Work', severity.work, (SeverityLevel l) => severity.copyWith(work: l)),
          ('Sleep', severity.sleep, (SeverityLevel l) => severity.copyWith(sleep: l)),
          ('Mobility', severity.mobility, (SeverityLevel l) => severity.copyWith(mobility: l)),
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                SizedBox(width: 80, child: Text(label, style: context.text.bodyMedium)),
                Expanded(
                  child: Wrap(
                    spacing: 6,
                    children: [
                      for (final l in const [SeverityLevel.mild, SeverityLevel.moderate, SeverityLevel.severe])
                        ChipToggle(
                          label: l.label,
                          selected: value == l,
                          selectedColor: switch (l) {
                            SeverityLevel.mild => AppColors.star,
                            SeverityLevel.moderate => AppColors.warning,
                            _ => AppColors.danger,
                          },
                          onChanged: on ? (_) => _set(_v.copyWith(severity: apply(l))) : null,
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        section('Previous treatments'),
        for (final t in PreviousTreatment.values)
          CheckboxListTile(
            value: _v.previousTreatments.contains(t.json),
            dense: true,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: AppColors.primary,
            title: Text(t.label),
            onChanged: on
                ? (sel) => _set(
                    _v.copyWith(
                      previousTreatments: sel == true
                          ? [..._v.previousTreatments, t.json]
                          : [
                              for (final x in _v.previousTreatments)
                                if (x != t.json) x,
                            ],
                    ),
                  )
                : null,
          ),
        section('Notes'),
        TextFormField(
          key: const ValueKey('intake-notes'),
          initialValue: _v.notes,
          enabled: on,
          minLines: 2,
          maxLines: 6,
          maxLength: 4000,
          decoration: const InputDecoration(hintText: 'Anything else the doctor should know'),
          onChanged: (t) => _set(_v.copyWith(notes: t)),
        ),
      ],
    );
  }
}

class _SymptomRow extends StatelessWidget {
  const _SymptomRow({super.key, required this.symptom, this.onAnswer, this.onRemove});

  final SymptomResponse symptom;
  final ValueChanged<SymptomAnswer>? onAnswer;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    Widget btn(SymptomAnswer a, IconData icon, Color color, String tip) {
      final on = symptom.answer == a;
      return IconButton(
        tooltip: '$tip: ${symptom.name}',
        isSelected: on,
        onPressed: onAnswer == null ? null : () => onAnswer!(a),
        style: IconButton.styleFrom(
          backgroundColor: on ? color.withValues(alpha: 0.2) : null,
          side: BorderSide(color: on ? color : context.palette.border),
        ),
        icon: Icon(icon, color: on ? color : context.palette.textMuted, size: 18),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(child: Text(symptom.name, style: context.text.bodyMedium)),
          btn(SymptomAnswer.no, Icons.close_rounded, AppColors.danger, 'No'),
          btn(SymptomAnswer.maybe, Icons.remove_rounded, AppColors.warning, 'Maybe'),
          btn(SymptomAnswer.yes, Icons.check_rounded, AppColors.primary, 'Yes'),
          IconButton(
            tooltip: 'Remove ${symptom.name}',
            onPressed: onRemove,
            icon: const Icon(Icons.delete_outline_rounded, size: 20),
          ),
        ],
      ),
    );
  }
}
