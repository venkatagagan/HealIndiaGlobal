import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/realtime_service.dart';
import '../../../core/repositories/screening_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../widgets/brain_backdrop.dart';
import '../providers/emergency_ack.dart';
import '../widgets/emergency_guidance.dart';

enum _Stage { waiting, done, emergency, failed, timeout, notSubmitted, error }

/// AI processing animation; polls `ScreeningRepository.watch(id)` (every 2 s) and listens for the
/// realtime `screening.completed` event, then goes to the matches.
///
/// Route: `/screening/:id/processing` · Owner: fl-screening.
class ScreeningProcessingScreen extends ConsumerStatefulWidget {
  const ScreeningProcessingScreen({super.key, required this.screeningId});

  final String screeningId;

  /// Number of steps of the animated checklist.
  static const stepCount = 3;

  /// Steps of the animated checklist, in the language of [l].
  static List<String> steps(AppLocalizations l) => [
    l.screeningProcessingStepAnalyzing,
    l.screeningProcessingStepMatching,
    l.screeningProcessingStepSavings,
  ];

  @override
  ConsumerState<ScreeningProcessingScreen> createState() => _ScreeningProcessingScreenState();
}

class _ScreeningProcessingScreenState extends ConsumerState<ScreeningProcessingScreen>
    with SingleTickerProviderStateMixin {
  static const _stepInterval = Duration(milliseconds: 1500);

  late final AnimationController _pulse = AnimationController(vsync: this, duration: const Duration(seconds: 6))
    ..repeat();
  StreamSubscription<Screening>? _sub;
  Timer? _stepTimer;
  Timer? _leaveTimer;
  int _active = 0;
  _Stage _stage = _Stage.waiting;
  Screening? _screening;
  Object? _error;
  bool _retrying = false;

  String get _id => widget.screeningId;

  @override
  void initState() {
    super.initState();
    _startWatching(initial: true);
  }

  @override
  void dispose() {
    unawaited(_sub?.cancel());
    _stepTimer?.cancel();
    _leaveTimer?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  void _startWatching({bool initial = false}) {
    unawaited(_sub?.cancel());
    _stepTimer?.cancel();
    _stage = _Stage.waiting;
    _error = null;
    _active = 0;
    if (!initial) setState(() {});
    _stepTimer = Timer.periodic(_stepInterval, (t) {
      if (_active < ScreeningProcessingScreen.stepCount - 1) {
        setState(() => _active++);
      } else {
        t.cancel();
      }
    });
    _sub = ref
        .read(screeningRepositoryProvider)
        .watch(_id)
        .listen(
          _onSnapshot,
          onError: (Object e) {
            if (!mounted) return;
            final api = ApiException.from(e);
            setState(() {
              _error = e;
              _stage = api.code == 'timeout' ? _Stage.timeout : _Stage.error;
            });
          },
        );
  }

  /// One-off refresh (realtime event).
  Future<void> _checkNow() async {
    if (_stage != _Stage.waiting) return;
    try {
      _onSnapshot(await ref.read(screeningRepositoryProvider).get(_id));
    } catch (_) {
      // polling continues; ignore
    }
  }

  void _onSnapshot(Screening s) {
    if (!mounted || _stage != _Stage.waiting) return;
    _screening = s;
    if (s.isProcessing) return;
    unawaited(_sub?.cancel());
    _sub = null;
    if (s.isDraft) {
      setState(() => _stage = _Stage.notSubmitted);
    } else if (s.isFailed) {
      setState(() => _stage = _Stage.failed);
    } else if ((s.urgency ?? s.aiResult?.urgency) == Urgency.emergency) {
      _stepTimer?.cancel();
      setState(() {
        _active = ScreeningProcessingScreen.stepCount;
        _stage = _Stage.emergency;
      });
    } else {
      _stepTimer?.cancel();
      setState(() {
        _active = ScreeningProcessingScreen.stepCount;
        _stage = _Stage.done;
      });
      _leaveTimer = Timer(const Duration(milliseconds: 700), _openMatches);
    }
  }

  void _openMatches() {
    if (mounted) context.go(Routes.matches(_id));
  }

  Future<void> _rerun() async {
    setState(() => _retrying = true);
    try {
      await ref.read(screeningRepositoryProvider).rerun(_id);
      if (mounted) _startWatching();
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _retrying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(realtimeEventsProvider, (_, next) {
      final e = next.value;
      if (e != null && e.type == RealtimeEvents.screeningCompleted && '${e.data['screening_id']}' == _id) {
        unawaited(_checkNow());
      }
    });

    if (_stage == _Stage.emergency) {
      final s = _screening;
      return Scaffold(
        body: EmergencyGuidanceView(
          redFlags: s?.redFlags.isNotEmpty == true ? s!.redFlags : (s?.aiResult?.redFlags ?? const []),
          homeCountry: s?.homeCountry,
          advice: s?.aiResult?.travelAdvice,
          onViewResults: () async {
            await ref.read(emergencyAckProvider.notifier).acknowledge(_id);
            _openMatches();
          },
          onClose: () => context.go(Routes.home),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF1E1B4B),
      body: Container(
        decoration: const BoxDecoration(gradient: AppColors.processingGradient),
        child: Stack(
          children: [
            Positioned.fill(
              child: ExcludeSemantics(
                child: AnimatedBuilder(
                  animation: _pulse,
                  builder: (context, _) => CustomPaint(painter: BrainBackdropPainter(t: _pulse.value)),
                ),
              ),
            ),
            SafeArea(
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsetsDirectional.fromSTEB(56, 12, 8, 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Semantics(
                            header: true,
                            child: Column(
                              children: [
                                Text(
                                  Brand.name,
                                  textAlign: TextAlign.center,
                                  style: context.text.titleMedium?.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  context.l10n.appTagline,
                                  textAlign: TextAlign.center,
                                  style: context.text.labelSmall?.copyWith(color: Colors.white70),
                                ),
                              ],
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: context.l10n.screeningProcessingHelpTitle,
                          color: Colors.white,
                          icon: const Icon(Icons.help_outline_rounded),
                          onPressed: () => _showHelp(context),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: Center(child: SingleChildScrollView(child: _body(context))),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    final l10n = context.l10n;
    final white = context.text.bodyMedium?.copyWith(color: Colors.white);
    final steps = ScreeningProcessingScreen.steps(l10n);
    switch (_stage) {
      case _Stage.waiting:
      case _Stage.done:
      case _Stage.emergency:
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(
                liveRegion: true,
                child: Text(
                  _stage == _Stage.done ? l10n.screeningProcessingReady : l10n.screeningProcessingFinding,
                  textAlign: TextAlign.center,
                  style: context.text.headlineMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w900),
                ),
              ),
              const SizedBox(height: 28),
              for (var i = 0; i < steps.length; i++)
                _ChecklistRow(
                  label: steps[i],
                  state: i < _active ? _RowState.done : (i == _active ? _RowState.active : _RowState.pending),
                ),
              const SizedBox(height: 28),
              Text(
                l10n.screeningProcessingTip,
                textAlign: TextAlign.center,
                style: white?.copyWith(color: Colors.white70, fontSize: 12),
              ),
            ],
          ),
        );
      case _Stage.failed:
        return _Problem(
          icon: Icons.error_outline_rounded,
          title: l10n.screeningProcessingFailedTitle,
          message: _screening?.error?.trim().isNotEmpty == true
              ? _screening!.error!
              : l10n.screeningProcessingFailedMessage,
          primaryLabel: l10n.commonTryAgain,
          loading: _retrying,
          onPrimary: _rerun,
          secondaryLabel: l10n.screeningStartNewButton,
          onSecondary: () => context.go(Routes.screeningStart(specialty: _screening?.specialty?.slug)),
        );
      case _Stage.timeout:
        return _Problem(
          icon: Icons.hourglass_bottom_rounded,
          title: l10n.screeningProcessingTimeoutTitle,
          message: l10n.screeningProcessingTimeoutMessage,
          primaryLabel: l10n.screeningProcessingKeepWaiting,
          onPrimary: _startWatching,
          secondaryLabel: l10n.screeningGoHome,
          onSecondary: () => context.go(Routes.home),
        );
      case _Stage.notSubmitted:
        return _Problem(
          icon: Icons.edit_note_rounded,
          title: l10n.screeningNotSubmittedTitle,
          message: l10n.screeningNotSubmittedMessage,
          primaryLabel: l10n.screeningContinueQuestionnaire,
          onPrimary: () => context.go(Routes.screeningStep(_id, 4)),
          secondaryLabel: l10n.screeningGoHome,
          onSecondary: () => context.go(Routes.home),
        );
      case _Stage.error:
        return _Problem(
          icon: Icons.wifi_off_rounded,
          title: l10n.screeningProcessingLostTitle,
          message: errorMessage(_error),
          primaryLabel: l10n.commonRetry,
          onPrimary: _startWatching,
          secondaryLabel: l10n.screeningGoHome,
          onSecondary: () => context.go(Routes.home),
        );
    }
  }

  void _showHelp(BuildContext context) => showDialog<void>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(ctx.l10n.screeningProcessingHelpTitle),
      content: Text(ctx.l10n.screeningProcessingHelpBody),
      actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: Text(ctx.l10n.commonOk))],
    ),
  );
}

enum _RowState { pending, active, done }

class _ChecklistRow extends StatelessWidget {
  const _ChecklistRow({required this.label, required this.state});

  final String label;
  final _RowState state;

  @override
  Widget build(BuildContext context) {
    const violet = Color(0xFF8B5CF6);
    final Widget icon = switch (state) {
      _RowState.done => Container(
        key: const ValueKey('done'),
        width: 26,
        height: 26,
        decoration: const BoxDecoration(color: violet, shape: BoxShape.circle),
        child: const Icon(Icons.check_rounded, size: 18, color: Colors.white),
      ),
      _RowState.active => Container(
        key: const ValueKey('active'),
        width: 26,
        height: 26,
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: violet, width: 2),
        ),
        child: const DecoratedBox(
          decoration: BoxDecoration(color: violet, shape: BoxShape.circle),
        ),
      ),
      _RowState.pending => Container(
        key: const ValueKey('pending'),
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white24, width: 2),
        ),
        child: const Icon(Icons.hourglass_empty_rounded, size: 14, color: Colors.white24),
      ),
    };
    return Semantics(
      label: context.l10n.screeningChecklistRowSemantics(label, state.name),
      excludeSemantics: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            AnimatedSwitcher(duration: const Duration(milliseconds: 300), child: icon),
            const SizedBox(width: 16),
            Expanded(
              child: AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 300),
                style: (context.text.bodyLarge ?? const TextStyle()).copyWith(
                  color: state == _RowState.pending ? Colors.white38 : Colors.white,
                  fontWeight: state == _RowState.active ? FontWeight.w700 : FontWeight.w500,
                ),
                child: Text(label),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Problem extends StatelessWidget {
  const _Problem({
    required this.icon,
    required this.title,
    required this.message,
    required this.primaryLabel,
    required this.onPrimary,
    required this.secondaryLabel,
    required this.onSecondary,
    this.loading = false,
  });

  final IconData icon;
  final String title;
  final String message;
  final String primaryLabel;
  final VoidCallback onPrimary;
  final String secondaryLabel;
  final VoidCallback onSecondary;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Column(
        children: [
          Icon(icon, size: 56, color: Colors.white),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: context.text.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: context.text.bodyMedium?.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: 24),
          PrimaryButton(label: primaryLabel, onPressed: onPrimary, loading: loading, tone: ButtonTone.violet),
          const SizedBox(height: 10),
          SecondaryButton(
            label: secondaryLabel,
            onPressed: onSecondary,
            foregroundColor: Colors.white,
            borderColor: Colors.white30,
          ),
        ],
      ),
    );
  }
}
