import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_theme.dart';
import '../../../l10n/l10n.dart';

/// Local emergency number for an ISO country code (112 is the international fallback).
String emergencyNumberFor(String? countryCode) => switch ((countryCode ?? '').toUpperCase()) {
  'US' || 'CA' || 'MX' => '911',
  'GB' || 'IE' || 'AE' || 'QA' || 'BH' || 'BD' || 'KE' => '999',
  'AU' => '000',
  'NZ' => '111',
  'SA' => '997',
  'OM' => '9999',
  _ => '112',
};

/// Full-screen red guidance shown when triage returns `urgency = emergency`: seek local emergency
/// care now instead of travelling.
class EmergencyGuidanceView extends StatelessWidget {
  const EmergencyGuidanceView({
    super.key,
    this.redFlags = const [],
    this.homeCountry,
    this.advice,
    this.onViewResults,
    this.onClose,
    this.acknowledgeLabel,
  });

  final List<String> redFlags;
  final String? homeCountry;
  final String? advice;

  /// "I understand - view results anyway".
  final VoidCallback? onViewResults;
  final VoidCallback? onClose;

  /// Label of the [onViewResults] acknowledgement button (default: "I understand - view my results anyway").
  final String? acknowledgeLabel;

  Future<void> _call(BuildContext context, String number) async {
    final ok = await launchUrl(Uri(scheme: 'tel', path: number));
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(context.l10n.emergencyDialNow(number))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final number = emergencyNumberFor(homeCountry);
    final l10n = context.l10n;
    const fg = Colors.white;
    return Container(
      color: const Color(0xFFB91C1C),
      child: SafeArea(
        child: Column(
          children: [
            if (onClose != null)
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: IconButton(
                  tooltip: l10n.commonClose,
                  onPressed: onClose,
                  icon: const Icon(Icons.close_rounded, color: fg),
                ),
              ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
                children: [
                  const Icon(Icons.emergency_rounded, color: fg, size: 72),
                  const SizedBox(height: 16),
                  Semantics(
                    header: true,
                    liveRegion: true,
                    child: Text(
                      l10n.emergencyTitle,
                      textAlign: TextAlign.center,
                      style: context.text.headlineMedium?.copyWith(color: fg, fontWeight: FontWeight.w900),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    advice?.trim().isNotEmpty == true ? advice! : l10n.emergencyBody,
                    textAlign: TextAlign.center,
                    style: context.text.bodyLarge?.copyWith(color: fg),
                  ),
                  if (redFlags.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(AppRadius.md),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.emergencyWarningSigns,
                            style: context.text.titleSmall?.copyWith(color: fg, fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 8),
                          for (final f in redFlags)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Icon(Icons.warning_amber_rounded, color: fg, size: 18),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(f, style: context.text.bodyMedium?.copyWith(color: fg)),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  Text(
                    l10n.emergencyNotDiagnosis,
                    textAlign: TextAlign.center,
                    style: context.text.bodySmall?.copyWith(color: fg.withValues(alpha: 0.85)),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
              child: Column(
                children: [
                  FilledButton.icon(
                    onPressed: () => _call(context, number),
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: const Color(0xFFB91C1C),
                      minimumSize: const Size(double.infinity, 56),
                    ),
                    icon: const Icon(Icons.call_rounded),
                    label: Text(l10n.emergencyCallButton(number)),
                  ),
                  if (onViewResults != null) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: onViewResults,
                      style: TextButton.styleFrom(foregroundColor: fg),
                      child: Text(acknowledgeLabel ?? l10n.emergencyAckViewResults, textAlign: TextAlign.center),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
