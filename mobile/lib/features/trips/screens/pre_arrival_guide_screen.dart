import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/repositories/catalog_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Practical pre-arrival guide (static checklist content + cultural tips from `/content/cultural-tips`).
class PreArrivalGuideScreen extends ConsumerWidget {
  const PreArrivalGuideScreen({super.key});

  static List<(IconData, String, List<String>)> _sections(AppLocalizations l) => [
    (
      Icons.assignment_ind_outlined,
      l.preArrivalVisaTitle,
      [l.preArrivalVisaPassport, l.preArrivalVisaEMedical, l.preArrivalVisaCopies],
    ),
    (
      Icons.medical_information_outlined,
      l.preArrivalMedicalTitle,
      [l.preArrivalMedicalReports, l.preArrivalMedicalMedicines, l.preArrivalMedicalAllergies],
    ),
    (
      Icons.luggage_outlined,
      l.preArrivalPackTitle,
      [l.preArrivalPackClothing, l.preArrivalPackAdapter, l.preArrivalPackJacket],
    ),
    (
      Icons.payments_outlined,
      l.preArrivalMoneyTitle,
      [l.preArrivalMoneyCards, l.preArrivalMoneyTellBank, l.preArrivalMoneyReceipts],
    ),
    (
      Icons.flight_land_outlined,
      l.preArrivalArrivalTitle,
      [l.preArrivalArrivalFlight, l.preArrivalArrivalDriver, l.preArrivalArrivalHelpline],
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tips = ref.watch(culturalTipsProvider);
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.preArrivalTitle), centerTitle: true),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        children: [
          for (final (icon, title, items) in _sections(l10n))
            AppCard(
              margin: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(icon, color: AppColors.violet),
                      const SizedBox(width: 10),
                      Text(title, style: context.text.titleMedium),
                    ],
                  ),
                  const SizedBox(height: 8),
                  for (final item in items)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Padding(
                            padding: EdgeInsets.only(top: 3),
                            child: Icon(Icons.check_circle_outline_rounded, size: 16, color: AppColors.primary),
                          ),
                          const SizedBox(width: 8),
                          Expanded(child: Text(item, style: context.text.bodyMedium)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          SectionTitle(l10n.preArrivalCulturalTips),
          tips.when(
            loading: () => const Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
            error: (e, _) => ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(culturalTipsProvider)),
            data: (list) => list.isEmpty
                ? Text(l10n.preArrivalTipsSoon, style: context.text.bodyMedium)
                : Column(
                    children: [
                      for (final t in list)
                        AppCard(
                          margin: const EdgeInsets.only(bottom: 8),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(t.title, style: context.text.titleSmall),
                              const SizedBox(height: 4),
                              Text(t.body, style: context.text.bodyMedium),
                            ],
                          ),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 12),
          Text(
            l10n.preArrivalDisclaimer,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
        ],
      ),
    );
  }
}
