import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
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
    final l10n = context.l10n;
    Widget section(String title) => Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 8),
      child: Semantics(header: true, child: Text(title, style: sectionStyle)),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        section(l10n.intakeMedicalArea),
        DropdownButtonFormField<String?>(
          key: const ValueKey('intake-specialty'),
          initialValue: slugs.contains(_v.specialtySlug) ? _v.specialtySlug : null,
          isExpanded: true,
          decoration: InputDecoration(labelText: l10n.intakeSpecialtyOptional),
          items: [
            DropdownMenuItem<String?>(child: Text(l10n.intakeNotSure)),
            for (final s in specialties) DropdownMenuItem<String?>(value: s.slug, child: Text(s.name)),
          ],
          onChanged: on ? (v) => _set(_v.copyWith(specialtySlug: v, clearSpecialty: v == null)) : null,
        ),
        section(l10n.intakeWhereProblem),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final r in BodyRegion.values)
              ChipToggle(
                label: r.labelIn(l10n),
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
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: on ? () => _set(_v.copyWith(painIntensity: 5)) : null,
              icon: const Icon(Icons.add_rounded),
              label: Text(l10n.intakeAddPain),
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
        section(l10n.intakeSymptoms),
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
                decoration: InputDecoration(hintText: l10n.intakeAddSymptomHint, counterText: '', isDense: true),
                onSubmitted: (_) => _addSymptom(),
              ),
            ),
            IconButton(
              tooltip: l10n.symptomAddTooltip,
              onPressed: on ? _addSymptom : null,
              icon: const Icon(Icons.add_circle_rounded, color: AppColors.primary),
            ),
          ],
        ),
        section(l10n.intakeHowLong),
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
        section(l10n.intakeDailyImpact),
        for (final (label, value, apply) in [
          (l10n.screeningImpactWork, severity.work, (SeverityLevel l) => severity.copyWith(work: l)),
          (l10n.screeningImpactSleep, severity.sleep, (SeverityLevel l) => severity.copyWith(sleep: l)),
          (l10n.screeningImpactMobility, severity.mobility, (SeverityLevel l) => severity.copyWith(mobility: l)),
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
        section(l10n.intakePreviousTreatments),
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
        section(l10n.intakeNotesLabel),
        TextFormField(
          key: const ValueKey('intake-notes'),
          initialValue: _v.notes,
          enabled: on,
          minLines: 2,
          maxLines: 6,
          maxLength: 4000,
          decoration: InputDecoration(hintText: l10n.intakeNotesHint),
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
    final l10n = context.l10n;
    Widget btn(SymptomAnswer a, IconData icon, Color color) {
      final on = symptom.answer == a;
      return IconButton(
        tooltip: l10n.symptomAnswerTooltip(a.label, symptom.name),
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
          btn(SymptomAnswer.no, Icons.close_rounded, AppColors.danger),
          btn(SymptomAnswer.maybe, Icons.remove_rounded, AppColors.warning),
          btn(SymptomAnswer.yes, Icons.check_rounded, AppColors.primary),
          IconButton(
            tooltip: l10n.symptomRemoveTooltip(symptom.name),
            onPressed: onRemove,
            icon: const Icon(Icons.delete_outline_rounded, size: 20),
          ),
        ],
      ),
    );
  }
}
