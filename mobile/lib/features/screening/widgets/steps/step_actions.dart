import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/widgets/widgets.dart';
import '../../providers/screening_draft.dart';

/// Common props of a questionnaire step.
abstract class ScreeningStepView extends ConsumerStatefulWidget {
  const ScreeningStepView({super.key, required this.screeningId});

  final String screeningId;
}

/// Shared navigation / persistence behavior of the step screens:
/// validate -> PATCH -> push the next step; "Previous" pops; "Save & Exit" PATCHes and goes home.
mixin ScreeningStepActions<T extends ScreeningStepView> on ConsumerState<T> {
  /// 1-based step number.
  int get step;

  bool busy = false;

  String get screeningId => widget.screeningId;

  ScreeningDraftController get draftController => ref.read(screeningDraftProvider(screeningId).notifier);

  ScreeningDraft? get draft => ref.read(screeningDraftProvider(screeningId)).value;

  void edit(ScreeningDraft Function(ScreeningDraft d) change) => draftController.edit(change);

  /// Validates (optionally) and PATCHes this step. Returns false and shows the reason on failure.
  Future<bool> persist({bool validate = true}) async {
    final d = draft;
    if (d == null) return false;
    if (validate) {
      final problem = d.validate(step);
      if (problem != null) {
        showInfoSnack(context, problem);
        return false;
      }
    }
    setState(() => busy = true);
    try {
      await draftController.save(step);
      return true;
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
      return false;
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  /// Saves this step and opens the next one.
  Future<void> goNext() async {
    if (busy) return;
    if (!await persist()) return;
    if (!mounted) return;
    await context.push(Routes.screeningStep(screeningId, step + 1));
  }

  /// Back to the previous step (local answers are kept in the shared draft).
  void goPrevious() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(Routes.screeningStep(screeningId, step - 1));
    }
  }

  /// PATCHes what has been answered so far (no validation) and leaves the questionnaire.
  Future<void> saveAndExit() async {
    if (busy) return;
    if (!await persist(validate: false)) return;
    if (!mounted) return;
    showInfoSnack(context, 'Progress saved. Continue any time from Home.');
    context.go(Routes.home);
  }
}
