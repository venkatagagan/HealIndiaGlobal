import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/models/models.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/widgets/widgets.dart';
import '../../providers/screening_draft.dart';
import '../screening_step_scaffold.dart';
import '../symptom_swipe_deck.dart';
import '../voice_intake_button.dart';
import 'step_actions.dart';

/// Step 2 - "Which symptoms are you experiencing?": swipe cards + "Your Symptoms" chips + custom.
class SymptomsStep extends ScreeningStepView {
  const SymptomsStep({super.key, required super.screeningId});

  @override
  ConsumerState<SymptomsStep> createState() => _SymptomsStepState();
}

class _SymptomsStepState extends ConsumerState<SymptomsStep> with ScreeningStepActions {
  final _custom = TextEditingController();

  @override
  int get step => 2;

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  void _addCustom() {
    final name = _custom.text.trim();
    if (name.isEmpty) return;
    if (name.length > 120) {
      showInfoSnack(context, 'Keep the symptom under 120 characters.');
      return;
    }
    if ((draft?.symptoms.length ?? 0) >= 60) {
      showInfoSnack(context, 'You can add up to 60 symptoms.');
      return;
    }
    edit((d) => d.answer(name, SymptomAnswer.yes));
    _custom.clear();
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(screeningDraftProvider(screeningId)).requireValue;
    final query = (specialty: d.specialtySlug, areas: (d.bodyAreas.toList()..sort()).join(','));
    final suggestions = ref.watch(symptomSuggestionsProvider(query));
    final answered = d.answeredNames;
    final mine = d.positiveSymptoms;

    return ScreeningStepScaffold(
      step: step,
      title: 'Which symptoms are you experiencing?',
      primaryLabel: 'Next',
      busy: busy,
      onPrimary: goNext,
      onBack: goPrevious,
      onPrevious: goPrevious,
      onSaveExit: saveAndExit,
      help:
          'Swipe a card right (or tap the check) if you have the symptom, left (or X) if you do not, and up '
          '(or -) if you are not sure. Add anything we did not ask about below.',
      children: [
        VoiceIntakeButton(screeningId: screeningId),
        const SizedBox(height: 12),
        suggestions.when(
          loading: () => const SizedBox(height: 260, child: LoadingView(message: 'Loading suggestions...')),
          error: (e, _) => Column(
            children: [
              ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(symptomSuggestionsProvider(query))),
              SymptomSwipeDeck(
                symptoms: const [],
                onAnswer: (_, _) {},
                emptyMessage: 'Suggestions are unavailable. Add your symptoms below.',
              ),
            ],
          ),
          data: (items) => SymptomSwipeDeck(
            symptoms: [
              for (final s in items)
                if (!answered.contains(s.name.toLowerCase())) s.name,
            ],
            onAnswer: (name, a) => edit((x) => x.answer(name, a)),
          ),
        ),
        const SizedBox(height: 24),
        Text('Your Symptoms', style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
        const SizedBox(height: 10),
        if (mine.isEmpty)
          Text(
            'Symptoms you answer "yes" or "maybe" to appear here.',
            style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
          )
        else
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in mine)
                ChipToggle(
                  key: ValueKey('my-symptom-${s.name}'),
                  label: s.answer == SymptomAnswer.maybe ? '${s.name} (maybe)' : s.name,
                  selected: true,
                  selectedColor: s.answer == SymptomAnswer.maybe
                      ? AppColors.warning
                      : (context.isDark ? AppColors.darkSurfaceAlt : AppColors.primaryDark),
                  onChanged: null,
                  onDeleted: () => edit((x) => x.removeSymptom(s.name)),
                ),
            ],
          ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _custom,
                maxLength: 120,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _addCustom(),
                decoration: const InputDecoration(
                  hintText: 'Add another symptom',
                  counterText: '',
                  prefixIcon: Icon(Icons.add_comment_outlined),
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(tooltip: 'Add symptom', onPressed: _addCustom, icon: const Icon(Icons.add_rounded)),
          ],
        ),
      ],
    );
  }
}
