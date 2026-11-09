import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/screening_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../screening/widgets/ai_consent_sheet.dart';
import '../../screening/widgets/body_map.dart';
import '../../screening/widgets/pain_slider.dart';
import '../agent_routes.dart';
import '../data/agent_repository.dart';
import '../shared/portal_widgets.dart';

/// Symptom suggestions for a specialty (null = generic list).
final _agentSymptomsProvider = FutureProvider.autoDispose.family<List<SymptomInfo>, String?>(
  (ref, slug) => ref.watch(catalogRepositoryProvider).symptoms(specialty: slug),
);

/// Polls a screening until `completed` / `failed` (core repository `watch`).
final agentScreeningWatchProvider = StreamProvider.autoDispose.family<Screening, String>(
  (ref, id) => ref.watch(screeningRepositoryProvider).watch(id),
);

/// Matches of a completed screening.
final agentScreeningMatchesProvider = FutureProvider.autoDispose.family<List<ScreeningMatch>, String>(
  (ref, id) => ref.watch(screeningRepositoryProvider).matches(id),
);

// ------------------------------------------------------------------------------------------ form

/// Screening questionnaire filled in by the agent on behalf of [patientId] (PLAN §8.6: `POST
/// /screenings {patient_id}`), condensed onto one page. Reuses the patient app's body map, pain
/// slider and AI-consent sheet.
class AgentScreeningFormScreen extends ConsumerStatefulWidget {
  const AgentScreeningFormScreen({super.key, required this.patientId});

  final String patientId;

  @override
  ConsumerState<AgentScreeningFormScreen> createState() => _AgentScreeningFormScreenState();
}

class _AgentScreeningFormScreenState extends ConsumerState<AgentScreeningFormScreen> {
  String? _specialty;
  Set<String> _areas = {};
  int _pain = 5;
  final Set<String> _symptoms = {};
  final _symptomCtrl = TextEditingController();
  final _notes = TextEditingController();
  final _treatments = TextEditingController();
  int _duration = 3;
  DurationUnit _unit = DurationUnit.months;
  SeverityLevel? _work;
  SeverityLevel? _sleep;
  SeverityLevel? _mobility;
  bool _submitting = false;

  @override
  void dispose() {
    _symptomCtrl.dispose();
    _notes.dispose();
    _treatments.dispose();
    super.dispose();
  }

  void _addSymptom() {
    final s = _symptomCtrl.text.trim();
    if (s.isEmpty) return;
    setState(() {
      _symptoms.add(s);
      _symptomCtrl.clear();
    });
  }

  Future<void> _submit() async {
    final consent = await showAiConsentSheet(context);
    if (consent == null || !mounted) return;
    setState(() => _submitting = true);
    try {
      final patient = await ref.read(agentPatientProvider(widget.patientId).future);
      final draft = await ref
          .read(agentRepositoryProvider)
          .createScreening(patientId: widget.patientId, specialtySlug: _specialty);
      final repo = ref.read(screeningRepositoryProvider);
      await repo.update(
        draft.id,
        ScreeningPatch(
          bodyAreas: _areas.toList(),
          painIntensity: _pain,
          symptoms: [for (final s in _symptoms) SymptomResponse(name: s, answer: SymptomAnswer.yes)],
          durationValue: _duration,
          durationUnit: _unit,
          severity: ScreeningSeverity(work: _work, sleep: _sleep, mobility: _mobility),
          previousTreatments: _treatments.text.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList(),
          notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          preferences: ScreeningPreferences(useAi: consent),
          homeCountry: patient.countryOfResidence ?? patient.nationality,
        ),
      );
      await repo.submit(draft.id, consentAi: consent);
      ref
        ..invalidate(patientScreeningsProvider(widget.patientId))
        ..invalidate(agentPatientProvider(widget.patientId));
      if (mounted) context.pushReplacement(AgentRoutes.screening(draft.id));
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final patientName = ref.watch(agentPatientProvider(widget.patientId)).value?.fullName;
    final specialties = ref.watch(specialtiesProvider);
    final suggestions = ref.watch(_agentSymptomsProvider(_specialty)).value ?? const <SymptomInfo>[];
    return Scaffold(
      appBar: AppBar(title: Text(patientName == null ? 'New screening' : 'Screening · $patientName')),
      body: ListView(
        padding: AppSpacing.pageAll,
        children: [
          const SectionTitle('What does the patient need help with?', padding: EdgeInsets.only(bottom: 10)),
          AsyncValueView(
            value: specialties,
            compactError: true,
            onRetry: () => ref.invalidate(specialtiesProvider),
            data: (list) => Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Not sure'),
                  selected: _specialty == null,
                  onSelected: (_) => setState(() => _specialty = null),
                ),
                for (final s in list)
                  ChoiceChip(
                    label: Text(s.name),
                    selected: _specialty == s.slug,
                    onSelected: (_) => setState(() => _specialty = s.slug),
                  ),
              ],
            ),
          ),
          const SectionTitle('Where is the problem?'),
          BodyMap(selected: _areas, onChanged: (v) => setState(() => _areas = v), height: 300),
          const SizedBox(height: 12),
          PainSlider(value: _pain, onChanged: (v) => setState(() => _pain = v)),
          const SectionTitle('Symptoms'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in {..._symptoms, ...suggestions.take(10).map((e) => e.name)})
                FilterChip(
                  label: Text(s),
                  selected: _symptoms.contains(s),
                  onSelected: (on) => setState(() => on ? _symptoms.add(s) : _symptoms.remove(s)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _symptomCtrl,
            onSubmitted: (_) => _addSymptom(),
            decoration: InputDecoration(
              hintText: 'Add another symptom',
              suffixIcon: IconButton(icon: const Icon(Icons.add_rounded), onPressed: _addSymptom),
            ),
          ),
          const SectionTitle('How long?'),
          Row(
            children: [
              IconButton.filledTonal(
                onPressed: _duration > 1 ? () => setState(() => _duration--) : null,
                icon: const Icon(Icons.remove_rounded),
              ),
              SizedBox(
                width: 48,
                child: Text('$_duration', textAlign: TextAlign.center, style: context.text.titleLarge),
              ),
              IconButton.filledTonal(
                onPressed: _duration < 99 ? () => setState(() => _duration++) : null,
                icon: const Icon(Icons.add_rounded),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<DurationUnit>(
                  initialValue: _unit,
                  items: [for (final u in DurationUnit.values) DropdownMenuItem(value: u, child: Text(u.label))],
                  onChanged: (u) => setState(() => _unit = u ?? _unit),
                ),
              ),
            ],
          ),
          const SectionTitle('Impact on daily life'),
          _SeverityRow(label: 'Work', value: _work, onChanged: (v) => setState(() => _work = v)),
          _SeverityRow(label: 'Sleep', value: _sleep, onChanged: (v) => setState(() => _sleep = v)),
          _SeverityRow(label: 'Mobility', value: _mobility, onChanged: (v) => setState(() => _mobility = v)),
          const SizedBox(height: 12),
          TextField(
            controller: _treatments,
            decoration: const InputDecoration(labelText: 'Previous treatments (comma separated)'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Notes for the medical team'),
          ),
          const SizedBox(height: 24),
          PrimaryButton(
            key: const ValueKey('agent-screening-submit'),
            label: 'Find matching hospitals',
            icon: Icons.auto_awesome_rounded,
            loading: _submitting,
            onPressed: _submitting ? null : _submit,
          ),
        ],
      ),
    );
  }
}

class _SeverityRow extends StatelessWidget {
  const _SeverityRow({required this.label, required this.value, required this.onChanged});

  final String label;
  final SeverityLevel? value;
  final ValueChanged<SeverityLevel?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(width: 72, child: Text(label)),
          Expanded(
            child: SegmentedButton<SeverityLevel>(
              showSelectedIcon: false,
              emptySelectionAllowed: true,
              segments: const [
                ButtonSegment(value: SeverityLevel.mild, label: Text('Mild')),
                ButtonSegment(value: SeverityLevel.moderate, label: Text('Moderate')),
                ButtonSegment(value: SeverityLevel.severe, label: Text('Severe')),
              ],
              selected: {?value},
              onSelectionChanged: (s) => onChanged(s.isEmpty ? null : s.first),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------- result

/// Screening progress / AI triage and matched hospitals; the agent requests quotes from them.
class AgentScreeningResultScreen extends ConsumerStatefulWidget {
  const AgentScreeningResultScreen({super.key, required this.screeningId});

  final String screeningId;

  @override
  ConsumerState<AgentScreeningResultScreen> createState() => _AgentScreeningResultScreenState();
}

class _AgentScreeningResultScreenState extends ConsumerState<AgentScreeningResultScreen> {
  final Set<String> _requested = {};
  final Set<String> _selected = {};
  bool _busy = false;

  Future<void> _requestQuotes(Screening s, List<ScreeningMatch> matches) async {
    final patientId = s.patientId;
    if (patientId == null) return;
    setState(() => _busy = true);
    final repo = ref.read(agentRepositoryProvider);
    var created = 0;
    try {
      for (final m in matches) {
        if (_requested.contains(m.id)) continue;
        await repo.createCase(
          patientId: patientId,
          hospitalId: m.hospital.id,
          doctorId: m.doctor?.id,
          procedureId: m.procedure?.id,
          specialtyId: s.specialty?.id,
          screeningId: s.id,
        );
        _requested.add(m.id);
        created++;
      }
      ref
        ..invalidate(patientCasesProvider(patientId))
        ..invalidate(agentCasesProvider);
      if (mounted) {
        setState(_selected.clear);
        showInfoSnack(context, 'Quote requested from $created hospital${created == 1 ? '' : 's'}');
      }
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final screening = ref.watch(agentScreeningWatchProvider(widget.screeningId));
    return Scaffold(
      appBar: AppBar(title: const Text('Screening result')),
      body: AsyncValueView(
        value: screening,
        onRetry: () => ref.invalidate(agentScreeningWatchProvider(widget.screeningId)),
        data: (s) {
          if (s.isDraft) {
            return const EmptyView(
              title: 'Screening not submitted',
              message: 'Run a new screening from the patient page.',
              icon: Icons.pending_actions_outlined,
            );
          }
          if (s.isProcessing) {
            return const LoadingView(message: 'Analysing the condition and matching specialists…');
          }
          if (s.isFailed) {
            return ErrorView(
              title: 'Screening could not be processed',
              error: s.error ?? 'Please try again.',
              onRetry: () async {
                await ref.read(screeningRepositoryProvider).rerun(s.id);
                ref.invalidate(agentScreeningWatchProvider(widget.screeningId));
              },
            );
          }
          return _result(s);
        },
      ),
    );
  }

  Widget _result(Screening s) {
    final matches = ref.watch(agentScreeningMatchesProvider(s.id));
    final triage = s.aiResult;
    final selectedMatches = (matches.value ?? const <ScreeningMatch>[]).where((m) => _selected.contains(m.id)).toList();
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: AppSpacing.pageAll,
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            s.specialty?.name ?? 'AI triage',
                            style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        if (s.urgency != null) StatusBadge.forEnum(s.urgency!, dense: true),
                      ],
                    ),
                    if (triage != null) ...[const SizedBox(height: 8), Text(triage.summary)],
                    for (final f in s.redFlags)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Row(
                          children: [
                            const Icon(Icons.warning_amber_rounded, color: AppColors.danger, size: 18),
                            const SizedBox(width: 6),
                            Expanded(child: Text(f)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              const SectionTitle('Matched hospitals', subtitle: 'Select hospitals to request itemised quotes from'),
              AsyncValueView(
                value: matches,
                compactError: true,
                onRetry: () => ref.invalidate(agentScreeningMatchesProvider(s.id)),
                data: (list) => list.isEmpty
                    ? const EmptyView(title: 'No matches yet', icon: Icons.search_off_rounded)
                    : Column(children: [for (final m in list) _matchTile(m)]),
              ),
              if (s.patientId != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: SecondaryButton(
                    label: 'Compare received quotes',
                    icon: Icons.compare_arrows_rounded,
                    onPressed: () => context.push(AgentRoutes.compare(s.patientId!)),
                  ),
                ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: PrimaryButton(
              key: const ValueKey('agent-request-quotes'),
              label: selectedMatches.isEmpty
                  ? 'Select hospitals'
                  : 'Request ${selectedMatches.length} quote${selectedMatches.length == 1 ? '' : 's'}',
              loading: _busy,
              onPressed: selectedMatches.isEmpty || _busy ? null : () => _requestQuotes(s, selectedMatches),
            ),
          ),
        ),
      ],
    );
  }

  Widget _matchTile(ScreeningMatch m) {
    final requested = _requested.contains(m.id);
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      selected: _selected.contains(m.id),
      onTap: requested
          ? null
          : () => setState(() => _selected.contains(m.id) ? _selected.remove(m.id) : _selected.add(m.id)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(m.hospital.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(
                  [?m.hospital.city, ?m.doctor?.fullName, ?m.procedure?.name].join(' · '),
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    StatusBadge(label: m.matchLabel, dense: true, color: AppColors.primary),
                    Text('est. ${money(m.estimatedCostMinor, m.currency)}', style: context.text.bodySmall),
                  ],
                ),
              ],
            ),
          ),
          if (requested)
            const StatusBadge(label: 'Requested', dense: true, color: AppColors.violet)
          else
            Checkbox(
              value: _selected.contains(m.id),
              onChanged: (v) => setState(() => v == true ? _selected.add(m.id) : _selected.remove(m.id)),
            ),
        ],
      ),
    );
  }
}
