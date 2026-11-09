import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../providers/screening_draft.dart';

/// Shared layout of the questionnaire steps: brand header (back + "Save & Exit"), "Step N of 4"
/// progress, scrollable content and the bottom action bar.
class ScreeningStepScaffold extends StatelessWidget {
  const ScreeningStepScaffold({
    super.key,
    required this.step,
    required this.children,
    required this.primaryLabel,
    required this.onPrimary,
    this.title,
    this.subtitle,
    this.titleAlign = TextAlign.center,
    this.accent = AppColors.primary,
    this.primaryTone = ButtonTone.green,
    this.busy = false,
    this.onBack,
    this.onPrevious,
    this.onSaveExit,
    this.optional = false,
    this.footer,
    this.help,
  });

  final int step;
  final List<Widget> children;
  final String? title;
  final String? subtitle;
  final TextAlign titleAlign;
  final Color accent;
  final String primaryLabel;
  final VoidCallback? onPrimary;
  final ButtonTone primaryTone;

  /// Shows the primary button spinner and disables the other actions.
  final bool busy;

  /// Header back arrow (hidden on step 1, which shows the logo instead).
  final VoidCallback? onBack;

  /// Bottom "Previous" button (step 2 in the design).
  final VoidCallback? onPrevious;
  final VoidCallback? onSaveExit;
  final bool optional;

  /// Extra widgets above the bottom buttons (e.g. "Skip & Use Defaults").
  final Widget? footer;

  /// Optional help text behind a (?) button.
  final String? help;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(onBack: busy ? null : onBack, onSaveExit: busy ? null : onSaveExit, help: help),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: StepProgressBar(
                step: step,
                total: kScreeningSteps,
                color: accent,
                suffix: optional ? 'Optional' : null,
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                children: [
                  if (title != null)
                    Semantics(
                      header: true,
                      child: Text(
                        title!,
                        textAlign: titleAlign,
                        style: context.text.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      subtitle!,
                      textAlign: titleAlign,
                      style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                    ),
                  ],
                  if (title != null || subtitle != null) const SizedBox(height: 16),
                  ...children,
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          decoration: BoxDecoration(
            color: context.theme.scaffoldBackgroundColor,
            border: Border(top: BorderSide(color: context.palette.border.withValues(alpha: 0.5))),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ?footer,
              Row(
                children: [
                  if (onPrevious != null) ...[
                    Expanded(
                      child: SecondaryButton(label: 'Previous', filled: true, onPressed: busy ? null : onPrevious),
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: PrimaryButton(label: primaryLabel, onPressed: onPrimary, loading: busy, tone: primaryTone),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({this.onBack, this.onSaveExit, this.help});

  final VoidCallback? onBack;
  final VoidCallback? onSaveExit;
  final String? help;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 8, 4),
      child: Row(
        children: [
          if (onBack != null)
            IconButton(tooltip: 'Back', icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20), onPressed: onBack)
          else
            const Padding(padding: EdgeInsets.only(left: 12, right: 10), child: BrandLogo(size: 32)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(Brand.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                Text(
                  Brand.tagline,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
                ),
              ],
            ),
          ),
          if (help != null)
            IconButton(
              tooltip: 'Help',
              icon: const Icon(Icons.help_outline_rounded),
              onPressed: () => showDialog<void>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('How this works'),
                  content: Text(help!),
                  actions: [TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Got it'))],
                ),
              ),
            ),
          if (onSaveExit != null)
            TextButton(
              onPressed: onSaveExit,
              style: TextButton.styleFrom(foregroundColor: context.colors.onSurface),
              child: const Text('Save & Exit'),
            ),
        ],
      ),
    );
  }
}
