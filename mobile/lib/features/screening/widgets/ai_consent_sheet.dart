import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';

/// Asks for consent to AI processing of the questionnaire (PLAN §9.9, `consent_ai`).
///
/// Returns `true` (agree), `false` (use the standard rules-based matching instead) or `null`
/// when dismissed.
Future<bool?> showAiConsentSheet(BuildContext context) => showModalBottomSheet<bool>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (ctx) => const _AiConsentSheet(),
);

class _AiConsentSheet extends StatelessWidget {
  const _AiConsentSheet();

  @override
  Widget build(BuildContext context) {
    Widget point(IconData icon, String text) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.violet),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: context.text.bodyMedium)),
        ],
      ),
    );
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(color: AppColors.violetSoft, shape: BoxShape.circle),
                  child: const Icon(Icons.psychology_alt_rounded, color: AppColors.violet),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Use AI recommendations?',
                    style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            point(
              Icons.description_outlined,
              'Your answers (and any reports you attached) are sent to our AI service to suggest relevant '
              'specialties, procedures and questions for your doctor.',
            ),
            point(
              Icons.medical_information_outlined,
              'This is not a diagnosis. A qualified doctor at the hospital reviews your case before any treatment.',
            ),
            point(
              Icons.lock_outline_rounded,
              'Your data is used only for this screening and is never sold. You can withdraw consent in your profile.',
            ),
            point(Icons.rule_rounded, 'Prefer not to? We will match you with our standard rules-based engine instead.'),
            const SizedBox(height: 8),
            PrimaryButton(
              label: 'I agree, use AI',
              tone: ButtonTone.violet,
              onPressed: () => Navigator.of(context).pop(true),
            ),
            const SizedBox(height: 10),
            SecondaryButton(label: 'Use standard matching', onPressed: () => Navigator.of(context).pop(false)),
          ],
        ),
      ),
    );
  }
}
