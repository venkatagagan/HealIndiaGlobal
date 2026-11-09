import '../../../core/models/models.dart';
import '../../../l10n/l10n.dart';
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
///
/// Labels are in the language of [l10n] (default: [L10n.current]).
IntakeMerge mergeIntake(ScreeningDraft d, IntakeSuggestion s, [AppLocalizations? l10n]) {
  final l = l10n ?? L10n.current;
  final applied = <String>[];
  final conflicts = <IntakeFieldConflict>[];
  var out = d;

  // body areas: union (adding is never destructive)
  final known = {for (final r in BodyRegion.values) r.json};
  final areas = s.bodyAreas.where(known.contains).toSet().difference(out.bodyAreas);
  if (areas.isNotEmpty) {
    out = out.copyWith(bodyAreas: {...out.bodyAreas, ...areas});
    applied.add(l.intakeAppliedBodyAreas);
  }

  // pain: the draft starts at 5; treat it as unanswered until saved on the server
  final pain = s.painIntensity;
  if (pain != null && pain != out.painIntensity) {
    if (d.source.painIntensity == null) {
      out = out.copyWith(painIntensity: pain);
      applied.add(l.intakeAppliedPainIntensity);
    } else {
      conflicts.add(
        IntakeFieldConflict(
          label: l.intakeConflictPainIntensity,
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
  if (addedSymptom) applied.add(l.intakeAppliedSymptoms);

  // duration
  final dv = s.durationValue;
  if (dv != null && dv > 0) {
    final unit = s.durationUnit ?? out.durationUnit;
    if (out.durationValue == null) {
      out = out.copyWith(durationValue: dv, durationUnit: unit);
      applied.add(l.intakeAppliedDuration);
    } else if (out.durationValue != dv || out.durationUnit != unit) {
      conflicts.add(
        IntakeFieldConflict(
          label: l.intakeConflictHowLong,
          current: l.intakeDurationValue(out.durationValue!, out.durationUnit.label.toLowerCase()),
          suggested: l.intakeDurationValue(dv, unit.label.toLowerCase()),
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
      (
        l.screeningImpactWork,
        out.severity.work,
        sev.work,
        (ScreeningSeverity v, SeverityLevel l) => v.copyWith(work: l),
      ),
      (
        l.screeningImpactSleep,
        out.severity.sleep,
        sev.sleep,
        (ScreeningSeverity v, SeverityLevel l) => v.copyWith(sleep: l),
      ),
      (
        l.screeningImpactMobility,
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
            label: l.intakeConflictDailyImpact(label),
            current: mine.label,
            suggested: theirs.label,
            apply: (x) => x.copyWith(severity: set(x.severity, theirs)),
          ),
        );
      }
    }
    if (filled) applied.add(l.intakeAppliedDailyImpact);
  }

  // previous treatments: union of known values
  final treatments = {for (final t in PreviousTreatment.values) t.json};
  final newTreatments = s.previousTreatments.where(treatments.contains).toSet().difference(out.previousTreatments);
  if (newTreatments.isNotEmpty) {
    out = out.copyWith(previousTreatments: {...out.previousTreatments, ...newTreatments});
    applied.add(l.intakeAppliedPreviousTreatments);
  }

  // notes
  final notes = s.notes.trim();
  if (notes.isNotEmpty && notes != out.notes.trim()) {
    if (out.notes.trim().isEmpty) {
      out = out.copyWith(notes: notes);
      applied.add(l.intakeAppliedNotes);
    } else {
      conflicts.add(
        IntakeFieldConflict(
          label: l.intakeNotesLabel,
          current: out.notes.trim(),
          suggested: notes,
          apply: (x) => x.copyWith(notes: notes),
        ),
      );
    }
  }

  return IntakeMerge(draft: out, applied: applied, conflicts: conflicts);
}
