import '../../../core/models/models.dart';
import '../../voice/models/voice_models.dart';
import '../widgets/body_map.dart';
import 'screening_draft.dart';

/// An answer where the confirmed voice / text intake differs from what the patient already gave.
class IntakeFieldConflict {
  const IntakeFieldConflict({required this.label, required this.current, required this.suggested, required this.apply});

  final String label;
  final String current;
  final String suggested;

  /// Replaces the patient's answer with the suggested one.
  final ScreeningDraft Function(ScreeningDraft draft) apply;
}

/// Result of [mergeIntake]: the draft with empty fields filled, what was filled, and conflicts.
class IntakeMerge {
  const IntakeMerge({required this.draft, required this.applied, required this.conflicts});

  final ScreeningDraft draft;

  /// Human labels of the fields that were filled / extended.
  final List<String> applied;
  final List<IntakeFieldConflict> conflicts;
}

/// Applies a patient-confirmed [IntakeSuggestion] to a screening draft without silently
/// overwriting answers the patient already gave (PLAN §7.2): empty fields are filled, lists are
/// extended, and differing answers are returned as [IntakeMerge.conflicts] for the patient to resolve.
IntakeMerge mergeIntake(ScreeningDraft d, IntakeSuggestion s) {
  final applied = <String>[];
  final conflicts = <IntakeFieldConflict>[];
  var out = d;

  // body areas: union (adding is never destructive)
  final known = {for (final r in BodyRegion.values) r.json};
  final areas = s.bodyAreas.where(known.contains).toSet().difference(out.bodyAreas);
  if (areas.isNotEmpty) {
    out = out.copyWith(bodyAreas: {...out.bodyAreas, ...areas});
    applied.add('body areas');
  }

  // pain: the draft starts at 5; treat it as unanswered until saved on the server
  final pain = s.painIntensity;
  if (pain != null && pain != out.painIntensity) {
    if (d.source.painIntensity == null) {
      out = out.copyWith(painIntensity: pain);
      applied.add('pain intensity');
    } else {
      conflicts.add(
        IntakeFieldConflict(
          label: 'Pain intensity',
          current: '${out.painIntensity}/10',
          suggested: '$pain/10',
          apply: (x) => x.copyWith(painIntensity: pain),
        ),
      );
    }
  }

  // symptoms: add new ones, conflict on a different answer for the same symptom
  var addedSymptom = false;
  for (final sym in s.symptoms) {
    final name = sym.name.trim();
    if (name.isEmpty) continue;
    final existing = out.symptoms.where((x) => x.name.toLowerCase() == name.toLowerCase()).firstOrNull;
    if (existing == null) {
      out = out.answer(name, sym.answer);
      addedSymptom = true;
    } else if (existing.answer != sym.answer) {
      conflicts.add(
        IntakeFieldConflict(
          label: existing.name,
          current: existing.answer.label,
          suggested: sym.answer.label,
          apply: (x) => x.answer(existing.name, sym.answer),
        ),
      );
    }
  }
  if (addedSymptom) applied.add('symptoms');

  // duration
  final dv = s.durationValue;
  if (dv != null && dv > 0) {
    final unit = s.durationUnit ?? out.durationUnit;
    if (out.durationValue == null) {
      out = out.copyWith(durationValue: dv, durationUnit: unit);
      applied.add('duration');
    } else if (out.durationValue != dv || out.durationUnit != unit) {
      conflicts.add(
        IntakeFieldConflict(
          label: 'How long',
          current: '${out.durationValue} ${out.durationUnit.label.toLowerCase()}',
          suggested: '$dv ${unit.label.toLowerCase()}',
          apply: (x) => x.copyWith(durationValue: dv, durationUnit: unit),
        ),
      );
    }
  }

  // severity, per dimension
  final sev = s.severity;
  if (sev != null) {
    var filled = false;
    for (final (label, mine, theirs, set) in [
      ('Work', out.severity.work, sev.work, (ScreeningSeverity v, SeverityLevel l) => v.copyWith(work: l)),
      ('Sleep', out.severity.sleep, sev.sleep, (ScreeningSeverity v, SeverityLevel l) => v.copyWith(sleep: l)),
      (
        'Mobility',
        out.severity.mobility,
        sev.mobility,
        (ScreeningSeverity v, SeverityLevel l) => v.copyWith(mobility: l),
      ),
    ]) {
      if (theirs == null || theirs == mine) continue;
      if (mine == null) {
        out = out.copyWith(severity: set(out.severity, theirs));
        filled = true;
      } else {
        conflicts.add(
          IntakeFieldConflict(
            label: 'Daily impact: $label',
            current: mine.label,
            suggested: theirs.label,
            apply: (x) => x.copyWith(severity: set(x.severity, theirs)),
          ),
        );
      }
    }
    if (filled) applied.add('daily impact');
  }

  // previous treatments: union of known values
  final treatments = {for (final t in PreviousTreatment.values) t.json};
  final newTreatments = s.previousTreatments.where(treatments.contains).toSet().difference(out.previousTreatments);
  if (newTreatments.isNotEmpty) {
    out = out.copyWith(previousTreatments: {...out.previousTreatments, ...newTreatments});
    applied.add('previous treatments');
  }

  // notes
  final notes = s.notes.trim();
  if (notes.isNotEmpty && notes != out.notes.trim()) {
    if (out.notes.trim().isEmpty) {
      out = out.copyWith(notes: notes);
      applied.add('notes');
    } else {
      conflicts.add(
        IntakeFieldConflict(
          label: 'Notes',
          current: out.notes.trim(),
          suggested: notes,
          apply: (x) => x.copyWith(notes: notes),
        ),
      );
    }
  }

  return IntakeMerge(draft: out, applied: applied, conflicts: conflicts);
}
