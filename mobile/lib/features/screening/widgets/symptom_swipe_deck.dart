import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../l10n/l10n.dart';

/// Color of a symptom answer (no = red, maybe = amber, yes = green).
Color answerColor(SymptomAnswer a) => switch (a) {
  SymptomAnswer.no => AppColors.danger,
  SymptomAnswer.maybe => AppColors.warning,
  SymptomAnswer.yes => AppColors.primary,
};

/// Stack of swipeable symptom cards. Swipe towards the end side = yes (right in LTR, left in RTL),
/// towards the start side = no, up = maybe, or tap the X / - / check buttons (which follow the same
/// reading direction).
class SymptomSwipeDeck extends StatefulWidget {
  const SymptomSwipeDeck({super.key, required this.symptoms, required this.onAnswer, this.emptyMessage});

  /// Unanswered symptom names; the first one is on top.
  final List<String> symptoms;
  final void Function(String name, SymptomAnswer answer) onAnswer;
  final String? emptyMessage;

  @override
  State<SymptomSwipeDeck> createState() => _SymptomSwipeDeckState();
}

class _SymptomSwipeDeckState extends State<SymptomSwipeDeck> with SingleTickerProviderStateMixin {
  static const double _threshold = 90;

  late final AnimationController _anim = AnimationController(vsync: this, duration: const Duration(milliseconds: 220));
  Offset _drag = Offset.zero;
  Offset _from = Offset.zero;
  Offset _to = Offset.zero;
  SymptomAnswer? _pending;

  @override
  void initState() {
    super.initState();
    _anim
      ..addListener(() => setState(() => _drag = Offset.lerp(_from, _to, Curves.easeOut.transform(_anim.value))!))
      ..addStatusListener((s) {
        if (s != AnimationStatus.completed) return;
        final answer = _pending;
        _pending = null;
        final name = widget.symptoms.isEmpty ? null : widget.symptoms.first;
        setState(() => _drag = Offset.zero);
        _anim.reset();
        if (answer != null && name != null) widget.onAnswer(name, answer);
      });
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  /// 1 in left-to-right layouts, -1 in right-to-left ones ("yes" is always towards the end side).
  double get _dir => Directionality.of(context) == TextDirection.rtl ? -1 : 1;

  SymptomAnswer? get _hint {
    final dx = _drag.dx * _dir;
    if (dx > _threshold / 2) return SymptomAnswer.yes;
    if (dx < -_threshold / 2) return SymptomAnswer.no;
    if (_drag.dy < -_threshold / 2) return SymptomAnswer.maybe;
    return null;
  }

  void _animateTo(Offset target, SymptomAnswer? answer) {
    if (_anim.isAnimating) return;
    _from = _drag;
    _to = target;
    _pending = answer;
    _anim.forward(from: 0);
  }

  void _answer(SymptomAnswer a) {
    if (widget.symptoms.isEmpty) return;
    final w = MediaQuery.sizeOf(context).width * _dir;
    _animateTo(switch (a) {
      SymptomAnswer.yes => Offset(w, 0),
      SymptomAnswer.no => Offset(-w, 0),
      SymptomAnswer.maybe => const Offset(0, -400),
    }, a);
  }

  void _onPanEnd(DragEndDetails d) {
    final dx = _drag.dx * _dir;
    if (dx > _threshold) return _answer(SymptomAnswer.yes);
    if (dx < -_threshold) return _answer(SymptomAnswer.no);
    if (_drag.dy < -_threshold) return _answer(SymptomAnswer.maybe);
    _animateTo(Offset.zero, null);
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.symptoms;
    final hasCards = items.isNotEmpty;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          height: 204,
          child: Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              if (!hasCards)
                _EmptyCard(message: widget.emptyMessage ?? context.l10n.symptomDeckAllAnswered)
              else ...[
                if (items.length > 1)
                  Transform.translate(
                    offset: const Offset(0, 10),
                    child: Transform.scale(scale: 0.94, child: _SymptomCard(name: items[1], dimmed: true)),
                  ),
                GestureDetector(
                  onPanUpdate: (d) => setState(() => _drag += d.delta),
                  onPanEnd: _onPanEnd,
                  child: Transform.translate(
                    offset: _drag,
                    child: Transform.rotate(
                      angle: (_drag.dx / 600).clamp(-0.35, 0.35) * math.pi / 4,
                      child: _SymptomCard(key: ValueKey('symptom-${items.first}'), name: items.first, hint: _hint),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _AnswerButton(answer: SymptomAnswer.no, icon: Icons.close_rounded, enabled: hasCards, onTap: _answer),
            const SizedBox(width: 16),
            _AnswerButton(answer: SymptomAnswer.maybe, icon: Icons.remove_rounded, enabled: hasCards, onTap: _answer),
            const SizedBox(width: 16),
            _AnswerButton(answer: SymptomAnswer.yes, icon: Icons.check_rounded, enabled: hasCards, onTap: _answer),
          ],
        ),
      ],
    );
  }
}

class _SymptomCard extends StatelessWidget {
  const _SymptomCard({super.key, required this.name, this.hint, this.dimmed = false});

  final String name;
  final SymptomAnswer? hint;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    final hintColor = hint == null ? null : answerColor(hint!);
    return Semantics(
      label: context.l10n.symptomCardSemantics(name),
      excludeSemantics: true,
      child: Container(
        width: 280,
        height: 184,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: dimmed ? context.palette.surfaceAlt.withValues(alpha: 0.6) : const Color(0xFF4B5563),
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: hintColor ?? context.palette.border, width: hintColor == null ? 1 : 3),
          boxShadow: dimmed
              ? null
              : [BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 18, offset: const Offset(0, 8))],
        ),
        child: dimmed
            ? null
            : Stack(
                children: [
                  Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 52,
                          height: 52,
                          decoration: const BoxDecoration(color: Color(0xFF14532D), shape: BoxShape.circle),
                          child: const Icon(Icons.sick_outlined, color: AppColors.primary, size: 30),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          name,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          context.l10n.symptomSwipeOrTap,
                          style: context.text.labelSmall?.copyWith(color: Colors.white70),
                        ),
                      ],
                    ),
                  ),
                  if (hint != null)
                    Align(
                      alignment: AlignmentDirectional.topEnd,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          border: Border.all(color: hintColor!, width: 2),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          hint!.label.toUpperCase(),
                          style: context.text.labelMedium?.copyWith(color: hintColor, fontWeight: FontWeight.w900),
                        ),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 280,
      height: 184,
      padding: const EdgeInsets.all(20),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: context.palette.surfaceAlt,
        borderRadius: BorderRadius.circular(AppRadius.lg),
        border: Border.all(color: context.palette.border),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.task_alt_rounded, color: AppColors.primary, size: 36),
          const SizedBox(height: 10),
          Text(message, textAlign: TextAlign.center, style: context.text.bodyMedium),
        ],
      ),
    );
  }
}

class _AnswerButton extends StatelessWidget {
  const _AnswerButton({required this.answer, required this.icon, required this.enabled, required this.onTap});

  final SymptomAnswer answer;
  final IconData icon;
  final bool enabled;
  final ValueChanged<SymptomAnswer> onTap;

  @override
  Widget build(BuildContext context) {
    final c = answerColor(answer);
    return Tooltip(
      message: answer.label,
      child: Semantics(
        button: true,
        enabled: enabled,
        label: context.l10n.symptomAnswerSemantics(answer.label),
        excludeSemantics: true,
        child: Material(
          color: c.withValues(alpha: enabled ? 0.28 : 0.1),
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: enabled ? () => onTap(answer) : null,
            child: SizedBox(
              width: 58,
              height: 58,
              child: Icon(icon, color: enabled ? c : c.withValues(alpha: 0.4), size: 30),
            ),
          ),
        ),
      ),
    );
  }
}
