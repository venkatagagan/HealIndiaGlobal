import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

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
    final l10n = context.l10n;
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
                    l10n.consentAiTitle,
                    style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            point(Icons.description_outlined, l10n.consentAiPointData),
            point(Icons.medical_information_outlined, l10n.consentAiPointNotDiagnosis),
            point(Icons.lock_outline_rounded, l10n.consentAiPointPrivacy),
            point(Icons.rule_rounded, l10n.consentAiPointAlternative),
            const SizedBox(height: 8),
            PrimaryButton(
              label: l10n.consentAiAgree,
              tone: ButtonTone.violet,
              onPressed: () => Navigator.of(context).pop(true),
            ),
            const SizedBox(height: 10),
            SecondaryButton(label: l10n.consentAiDecline, onPressed: () => Navigator.of(context).pop(false)),
          ],
        ),
      ),
    );
  }
}
