import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../screening/widgets/emergency_guidance.dart';
import '../data/voice_recorder.dart';
import '../data/voice_repository.dart';
import '../models/voice_models.dart';
import '../widgets/intake_review_form.dart';

enum _Phase { idle, recording, recorded, uploading, processing, typing, extracting, review }

/// `/voice/intake?screeningId=` — "Describe it by voice" (PLAN §7.2). English only: the backend
/// transcribes English speech; the patient reviews the transcript and the extracted answers.
///
/// Record (3-minute cap) → upload with consent → transcript → editable
/// review of the extracted answers → Confirm. Pops with a [VoiceIntakeResult] holding the
/// confirmed answers; the screening applies them (filling empty fields, asking about conflicts).
/// "Type instead" uses `POST /voice/intake-extract` with the same review form.
class VoiceIntakeScreen extends ConsumerStatefulWidget {
  const VoiceIntakeScreen({super.key, this.screeningId, this.pollInterval = const Duration(seconds: 2)});

  final String? screeningId;
  final Duration pollInterval;

  @override
  ConsumerState<VoiceIntakeScreen> createState() => _VoiceIntakeScreenState();
}

class _VoiceIntakeScreenState extends ConsumerState<VoiceIntakeScreen> {
  VoiceRecorder? _rec;
  VoiceRecorder get _recorder => _rec ??= ref.read(voiceRecorderProvider)();
  _Phase _phase = _Phase.idle;
  bool _consent = false;
  String? _message;
  VoiceClip? _clip;
  Duration _elapsed = Duration.zero;
  double _level = 0;
  Timer? _ticker;
  Timer? _poll;
  StreamSubscription<double>? _levels;
  VoiceTranscription? _transcription;
  IntakeSuggestion? _intake;
  String _transcript = '';
  final _typed = TextEditingController();
  bool _busy = false;
  bool _emergencyShown = false;

  VoiceRepository get _repo => ref.read(voiceRepositoryProvider);

  @override
  void dispose() {
    _ticker?.cancel();
    _poll?.cancel();
    unawaited(_levels?.cancel());
    _typed.dispose();
    final rec = _rec;
    if (rec != null) unawaited(rec.dispose());
    super.dispose();
  }

  // ---------------------------------------------------------------- recording

  Future<void> _start() async {
    setState(() => _message = null);
    bool allowed;
    try {
      allowed = await _recorder.hasPermission();
    } catch (_) {
      allowed = false;
    }
    if (!mounted) return;
    if (!allowed) {
      setState(() => _message = context.l10n.voiceMicOff);
      return;
    }
    try {
      await _recorder.start();
    } catch (e) {
      if (mounted) setState(() => _message = context.l10n.voiceStartFailed);
      return;
    }
    _levels = _recorder.levels().listen((l) {
      if (mounted) setState(() => _level = l);
    });
    _elapsed = Duration.zero;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _elapsed += const Duration(seconds: 1));
      if (_elapsed >= VoiceRepository.maxDuration) unawaited(_stop());
    });
    setState(() {
      _phase = _Phase.recording;
      _clip = null;
    });
  }

  Future<void> _stop() async {
    if (_phase != _Phase.recording) return;
    _ticker?.cancel();
    final levels = _levels;
    _levels = null;
    if (levels != null) unawaited(levels.cancel()); // never block stopping on the level stream
    final clip = await _recorder.stop();
    if (!mounted) return;
    setState(() {
      _level = 0;
      _clip = clip;
      _phase = clip == null ? _Phase.idle : _Phase.recorded;
      if (clip == null) _message = context.l10n.voiceNothingRecorded;
    });
  }

  Future<void> _upload() async {
    final clip = _clip;
    if (clip == null) return;
    if (!_consent) {
      setState(() => _message = context.l10n.voiceConsentRequired);
      return;
    }
    setState(() {
      _phase = _Phase.uploading;
      _message = null;
    });
    try {
      final t = await _repo.upload(
        fileName: clip.fileName,
        contentType: clip.contentType,
        filePath: clip.path,
        bytes: clip.bytes,
        screeningId: widget.screeningId,
      );
      if (!mounted) return;
      _onTranscription(t);
    } catch (e) {
      if (!mounted) return;
      setState(() => _phase = _Phase.recorded);
      showErrorSnack(context, e);
    }
  }

  void _onTranscription(VoiceTranscription t) {
    _transcription = t;
    if (t.status.isPending) {
      setState(() => _phase = _Phase.processing);
      _poll = Timer(widget.pollInterval, _refresh);
    } else if (t.status == VoiceStatus.failed) {
      setState(() {
        _phase = _Phase.recorded;
        _message = t.error ?? context.l10n.voiceNotUnderstood;
      });
    } else {
      _openReview(t.intakeSuggestion ?? const IntakeSuggestion(), t.transcript);
    }
  }

  Future<void> _refresh() async {
    final id = _transcription?.id;
    if (id == null) return;
    try {
      final t = await _repo.get(id);
      if (mounted) _onTranscription(t);
    } catch (_) {
      if (mounted) _poll = Timer(widget.pollInterval, _refresh);
    }
  }

  // ---------------------------------------------------------------- typing

  Future<void> _extract() async {
    final text = _typed.text.trim();
    if (text.length < 3) {
      setState(() => _message = context.l10n.voiceExtractTooShort);
      return;
    }
    setState(() {
      _phase = _Phase.extracting;
      _message = null;
    });
    try {
      final s = await _repo.intakeExtract(text, screeningId: widget.screeningId);
      if (mounted) _openReview(s, text);
    } catch (e) {
      if (!mounted) return;
      setState(() => _phase = _Phase.typing);
      showErrorSnack(context, e);
    }
  }

  // ---------------------------------------------------------------- review

  void _openReview(IntakeSuggestion s, String transcript) {
    setState(() {
      _intake = s;
      _transcript = transcript;
      _phase = _Phase.review;
    });
    if (s.isEmergency && !_emergencyShown) {
      _emergencyShown = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _showEmergency(s));
    }
  }

  Future<void> _showEmergency(IntakeSuggestion s) async {
    if (!mounted) return;
    await Navigator.of(context, rootNavigator: true).push<void>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (ctx) => Scaffold(
          body: EmergencyGuidanceView(
            redFlags: s.redFlags,
            acknowledgeLabel: ctx.l10n.voiceEmergencyAck,
            onViewResults: () => Navigator.of(ctx).pop(),
            onClose: () => Navigator.of(ctx).pop(),
          ),
        ),
      ),
    );
  }

  Future<void> _confirm() async {
    final intake = _intake;
    if (intake == null) return;
    final t = _transcription;
    setState(() => _busy = true);
    try {
      var conflicts = const <IntakeConflict>[];
      if (t != null) {
        final res = await _repo.confirm(t.id, transcript: _transcript.trim(), intake: intake);
        conflicts = res.conflicts;
      }
      if (!mounted) return;
      Navigator.of(context).pop(VoiceIntakeResult(intake: intake, transcriptionId: t?.id, serverConflicts: conflicts));
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _discard() async {
    final t = _transcription;
    setState(() => _busy = true);
    try {
      if (t != null) await _repo.discard(t.id);
      if (!mounted) return;
      setState(() {
        _transcription = null;
        _intake = null;
        _clip = null;
        _emergencyShown = false;
        _phase = _Phase.idle;
      });
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ---------------------------------------------------------------- UI

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_phase == _Phase.review ? context.l10n.voiceReviewTitle : context.l10n.voiceIntakeTitle),
      ),
      body: switch (_phase) {
        _Phase.review => _review(context),
        _Phase.uploading || _Phase.processing || _Phase.extracting => _working(context),
        _Phase.typing => _typing(context),
        _ => _recorderView(context),
      },
    );
  }

  Widget _messageText(BuildContext context) => _message == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Text(
            _message!,
            textAlign: TextAlign.center,
            style: context.text.bodySmall?.copyWith(color: AppColors.danger),
          ),
        );

  Widget _recorderView(BuildContext context) {
    final recording = _phase == _Phase.recording;
    final recorded = _phase == _Phase.recorded;
    String mmss(Duration d) => '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
    final l10n = context.l10n;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      children: [
        Text(
          l10n.voiceIntro,
          textAlign: TextAlign.center,
          style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
        ),
        const SizedBox(height: 28),
        Center(
          child: Semantics(
            button: true,
            label: recording ? l10n.voiceStopRecording : (recorded ? l10n.voiceRecordAgain : l10n.voiceStartRecording),
            excludeSemantics: true,
            child: GestureDetector(
              key: const ValueKey('voice-mic'),
              onTap: recording ? _stop : _start,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 120),
                width: 132 + (recording ? 36 * _level : 0),
                height: 132 + (recording ? 36 * _level : 0),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: (recording ? AppColors.danger : AppColors.primary).withValues(alpha: 0.18),
                ),
                alignment: Alignment.center,
                child: CircleAvatar(
                  radius: 52,
                  backgroundColor: recording ? AppColors.danger : AppColors.primary,
                  child: Icon(
                    recording ? Icons.stop_rounded : (recorded ? Icons.replay_rounded : Icons.mic_rounded),
                    color: Colors.white,
                    size: 48,
                  ),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(
          recording
              ? '${mmss(_elapsed)} / ${mmss(VoiceRepository.maxDuration)}'
              : recorded
              ? l10n.voiceRecordedStatus(mmss(_clip?.duration ?? _elapsed))
              : l10n.voiceTapToStart,
          textAlign: TextAlign.center,
          style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
        ),
        if (recording) ...[
          const SizedBox(height: 10),
          Semantics(
            label: l10n.voiceInputLevel,
            child: LinearProgressIndicator(value: _level, color: AppColors.danger, minHeight: 6),
          ),
        ],
        _messageText(context),
        if (recorded) ...[
          const SizedBox(height: 20),
          CheckboxListTile(
            key: const ValueKey('voice-consent'),
            value: _consent,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: AppColors.primary,
            onChanged: (v) => setState(() => _consent = v ?? false),
            title: Text(l10n.voiceConsentText, style: context.text.bodySmall),
          ),
          const SizedBox(height: 8),
          PrimaryButton(label: l10n.voiceUseRecording, icon: Icons.send_rounded, onPressed: _upload),
        ],
        const SizedBox(height: 16),
        TextButton.icon(
          onPressed: recording ? null : () => setState(() => _phase = _Phase.typing),
          icon: const Icon(Icons.keyboard_rounded),
          label: Text(l10n.voiceTypeInstead),
        ),
      ],
    );
  }

  Widget _typing(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
    children: [
      TextField(
        key: const ValueKey('voice-typed'),
        controller: _typed,
        minLines: 5,
        maxLines: 12,
        maxLength: 4000,
        decoration: InputDecoration(hintText: context.l10n.voiceTypedHint, alignLabelWithHint: true),
      ),
      _messageText(context),
      const SizedBox(height: 12),
      PrimaryButton(label: context.l10n.voiceFillAnswers, icon: Icons.auto_awesome_rounded, onPressed: _extract),
      const SizedBox(height: 8),
      TextButton.icon(
        onPressed: () => setState(() => _phase = _clip == null ? _Phase.idle : _Phase.recorded),
        icon: const Icon(Icons.mic_rounded),
        label: Text(context.l10n.voiceSpeakInstead),
      ),
    ],
  );

  Widget _working(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(color: AppColors.primary),
          const SizedBox(height: 20),
          Semantics(
            liveRegion: true,
            child: Text(switch (_phase) {
              _Phase.uploading => context.l10n.voiceUploading,
              _Phase.extracting => context.l10n.voiceReading,
              _ => context.l10n.voiceListening,
            }, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 8),
          Text(
            context.l10n.voiceCheckEveryAnswer,
            textAlign: TextAlign.center,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
        ],
      ),
    ),
  );

  Widget _review(BuildContext context) {
    final s = _intake!;
    final t = _transcription;
    final l10n = context.l10n;
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (s.isEmergency)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.dangerSoft,
                    border: Border.all(color: AppColors.danger),
                    borderRadius: BorderRadius.circular(AppRadius.md),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.emergency_rounded, color: AppColors.danger),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          l10n.voiceEmergencyBanner,
                          style: context.text.bodySmall?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      TextButton(onPressed: () => _showEmergency(s), child: Text(l10n.voiceGuidance)),
                    ],
                  ),
                ),
              Text(
                l10n.voiceReviewIntro,
                style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
              ),
              const SizedBox(height: 16),
              TextFormField(
                key: const ValueKey('voice-transcript'),
                initialValue: _transcript,
                enabled: !_busy,
                minLines: 2,
                maxLines: 8,
                decoration: InputDecoration(
                  labelText: t == null ? l10n.voiceYourDescription : l10n.voiceWhatYouSaid,
                  alignLabelWithHint: true,
                ),
                onChanged: (v) => _transcript = v,
              ),
              IntakeReviewForm(initial: s, enabled: !_busy, onChanged: (v) => _intake = v),
              const SizedBox(height: 12),
              Text(
                l10n.voiceAiDisclaimer,
                textAlign: TextAlign.center,
                style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
              ),
            ],
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: SecondaryButton(
                    label: l10n.voiceDiscard,
                    onPressed: _busy ? null : _discard,
                    foregroundColor: context.colors.onSurface,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: PrimaryButton(
                    label: l10n.commonConfirm,
                    icon: Icons.check_rounded,
                    loading: _busy,
                    onPressed: _busy ? null : _confirm,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
