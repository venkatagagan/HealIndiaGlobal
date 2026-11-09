import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/screening_repository.dart';
import '../../../l10n/l10n.dart';

/// Number of questionnaire steps (PLAN §11).
const int kScreeningSteps = 4;

/// Max uploaded reports per screening (server limit `report_document_ids <= 10`).
const int kMaxScreeningReports = 10;

/// A report attached to the screening (document id + display name).
class ScreeningReport {
  const ScreeningReport({required this.id, required this.name});

  final String id;
  final String name;
}

/// Local, editable copy of a draft screening shared by the four step screens.
///
/// Every step edits this object and PATCHes only its own fields on "Next" ([patchFor]).
class ScreeningDraft {
  const ScreeningDraft({
    required this.source,
    this.bodyAreas = const <String>{},
    this.painIntensity = 5,
    this.symptoms = const [],
    this.durationValue,
    this.durationUnit = DurationUnit.weeks,
    this.severity = const ScreeningSeverity(),
    this.previousTreatments = const <String>{},
    this.notes = '',
    this.reports = const [],
    this.preferences = const ScreeningPreferences(),
  });

  /// Builds the draft from the server copy (resume / deep link).
  factory ScreeningDraft.fromScreening(Screening s) => ScreeningDraft(
    source: s,
    bodyAreas: {...s.bodyAreas},
    painIntensity: (s.painIntensity ?? 5).clamp(0, 10),
    symptoms: s.symptoms,
    durationValue: s.durationValue,
    durationUnit: s.durationUnit ?? DurationUnit.weeks,
    severity: s.severity,
    previousTreatments: {...s.previousTreatments},
    notes: s.notes ?? '',
    reports: [
      for (var i = 0; i < s.reportDocumentIds.length; i++)
        ScreeningReport(id: s.reportDocumentIds[i], name: L10n.current.screeningReportNumbered(i + 1)),
    ],
    preferences: s.preferences,
  );

  /// Last server snapshot.
  final Screening source;
  final Set<String> bodyAreas;

  /// 0-10
  final int painIntensity;

  /// All answered symptoms (yes / maybe / no), in answer order.
  final List<SymptomResponse> symptoms;
  final int? durationValue;
  final DurationUnit durationUnit;
  final ScreeningSeverity severity;

  /// `PreviousTreatment` wire values.
  final Set<String> previousTreatments;
  final String notes;
  final List<ScreeningReport> reports;
  final ScreeningPreferences preferences;

  String get id => source.id;
  String? get specialtySlug => source.specialty?.slug;
  String? get specialtyName => source.specialty?.name;

  /// Symptoms the patient has (yes / maybe) - shown as "Your Symptoms" chips.
  List<SymptomResponse> get positiveSymptoms => symptoms.where((s) => s.answer != SymptomAnswer.no).toList();

  /// Names already answered (case-insensitive) so suggestions are not asked twice.
  Set<String> get answeredNames => {for (final s in symptoms) s.name.toLowerCase()};

  ScreeningDraft copyWith({
    Screening? source,
    Set<String>? bodyAreas,
    int? painIntensity,
    List<SymptomResponse>? symptoms,
    int? durationValue,
    bool clearDurationValue = false,
    DurationUnit? durationUnit,
    ScreeningSeverity? severity,
    Set<String>? previousTreatments,
    String? notes,
    List<ScreeningReport>? reports,
    ScreeningPreferences? preferences,
  }) => ScreeningDraft(
    source: source ?? this.source,
    bodyAreas: bodyAreas ?? this.bodyAreas,
    painIntensity: painIntensity ?? this.painIntensity,
    symptoms: symptoms ?? this.symptoms,
    durationValue: clearDurationValue ? null : (durationValue ?? this.durationValue),
    durationUnit: durationUnit ?? this.durationUnit,
    severity: severity ?? this.severity,
    previousTreatments: previousTreatments ?? this.previousTreatments,
    notes: notes ?? this.notes,
    reports: reports ?? this.reports,
    preferences: preferences ?? this.preferences,
  );

  /// Records (or replaces) the answer for [name].
  ScreeningDraft answer(String name, SymptomAnswer answer) {
    final key = name.trim().toLowerCase();
    final next = [
      for (final s in symptoms)
        if (s.name.toLowerCase() != key) s,
      SymptomResponse(name: name.trim(), answer: answer),
    ];
    return copyWith(symptoms: next);
  }

  /// Removes the answer for [name].
  ScreeningDraft removeSymptom(String name) {
    final key = name.toLowerCase();
    return copyWith(
      symptoms: [
        for (final s in symptoms)
          if (s.name.toLowerCase() != key) s,
      ],
    );
  }

  /// Validation message for [step] in the language of [l] (default: [L10n.current]), or null when
  /// the step can be completed.
  String? validate(int step, [AppLocalizations? l]) {
    final s = l ?? L10n.current;
    return switch (step) {
      1 => bodyAreas.isEmpty ? s.screeningValidateBodyArea : null,
      2 => positiveSymptoms.isEmpty ? s.screeningValidateSymptoms : null,
      3 => (durationValue == null || durationValue! < 1) ? s.screeningValidateDuration : null,
      4 => _validatePreferences(s),
      _ => null,
    };
  }

  String? _validatePreferences(AppLocalizations s) {
    final p = preferences;
    if (p.budgetMinMinor != null && p.budgetMaxMinor != null && p.budgetMinMinor! > p.budgetMaxMinor!) {
      return s.screeningValidateBudget;
    }
    if (p.travelWindowStart != null && p.travelWindowEnd != null && p.travelWindowStart!.isAfter(p.travelWindowEnd!)) {
      return s.screeningValidateTravelWindow;
    }
    return null;
  }

  /// The PATCH body for the fields owned by [step].
  ScreeningPatch patchFor(int step) => switch (step) {
    1 => ScreeningPatch(bodyAreas: bodyAreas.toList(), painIntensity: painIntensity),
    2 => ScreeningPatch(symptoms: symptoms),
    3 => ScreeningPatch(
      durationValue: durationValue,
      durationUnit: durationUnit,
      severity: severity,
      previousTreatments: previousTreatments.toList(),
      reportDocumentIds: [for (final r in reports) r.id],
      notes: notes.trim().isEmpty ? null : notes.trim(),
    ),
    _ => ScreeningPatch(preferences: preferences),
  };
}

/// Editable draft of screening `id`, loaded from `GET /screenings/{id}`.
///
/// `ref.watch(screeningDraftProvider(id))` in every step; `ref.read(...notifier).edit(...)` to change
/// answers; [ScreeningDraftController.save] to PATCH a step; [ScreeningDraftController.submit] at the end.
final screeningDraftProvider = AsyncNotifierProvider.autoDispose
    .family<ScreeningDraftController, ScreeningDraft, String>(ScreeningDraftController.new);

class ScreeningDraftController extends AsyncNotifier<ScreeningDraft> {
  ScreeningDraftController(this.screeningId);

  final String screeningId;

  @override
  Future<ScreeningDraft> build() async =>
      ScreeningDraft.fromScreening(await ref.watch(screeningRepositoryProvider).get(screeningId));

  /// Applies a local edit (no network).
  void edit(ScreeningDraft Function(ScreeningDraft draft) change) {
    final d = state.value;
    if (d == null) return;
    state = AsyncData(change(d));
  }

  /// PATCHes the fields of [step] and refreshes the server snapshot.
  Future<Screening> save(int step) async {
    final d = state.requireValue;
    final updated = await ref.read(screeningRepositoryProvider).update(screeningId, d.patchFor(step));
    final current = state.value ?? d;
    if (ref.mounted) state = AsyncData(current.copyWith(source: updated));
    return updated;
  }

  /// Submits the screening (`processing`). [consentAi] must be true while `use_ai` is on.
  ///
  /// The local draft is left untouched so the step screen does not flip to its "already submitted"
  /// state while the caller navigates to the processing screen.
  Future<Screening> submit({required bool consentAi}) =>
      ref.read(screeningRepositoryProvider).submit(screeningId, consentAi: consentAi);
}

/// Arguments of [symptomSuggestionsProvider]: specialty slug and comma-separated body areas.
typedef SymptomQuery = ({String? specialty, String areas});

/// Symptom suggestions from `/content/symptoms` for the chosen specialty and body areas.
///
/// Queries each area (with the specialty filter); falls back to area-only, then specialty-only
/// results when the combination is empty. De-duplicated, in library order.
final symptomSuggestionsProvider = FutureProvider.autoDispose.family<List<SymptomInfo>, SymptomQuery>((ref, q) async {
  final repo = ref.watch(catalogRepositoryProvider);
  final areas = q.areas.split(',').where((a) => a.isNotEmpty).toList();
  final seen = <String>{};
  final out = <SymptomInfo>[];
  void addAll(Iterable<SymptomInfo> items) {
    for (final s in items) {
      if (seen.add(s.name.toLowerCase())) out.add(s);
    }
  }

  Future<List<SymptomInfo>> byAreas({String? specialty}) async {
    if (areas.isEmpty) return repo.symptoms(specialty: specialty);
    final results = await Future.wait([for (final a in areas) repo.symptoms(specialty: specialty, bodyArea: a)]);
    return [for (final r in results) ...r];
  }

  addAll(await byAreas(specialty: q.specialty));
  if (out.isEmpty && q.specialty != null && areas.isNotEmpty) addAll(await byAreas());
  if (out.isEmpty && q.specialty != null) addAll(await repo.symptoms(specialty: q.specialty));
  return out;
});
