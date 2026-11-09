import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/repositories/catalog_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';

/// Practical pre-arrival guide (static checklist content + cultural tips from `/content/cultural-tips`).
class PreArrivalGuideScreen extends ConsumerWidget {
  const PreArrivalGuideScreen({super.key});

  static const _sections = <(IconData, String, List<String>)>[
    (
      Icons.assignment_ind_outlined,
      'Visa & documents',
      [
        'Passport valid for at least 6 months, with two blank pages.',
        'Indian e-Medical visa (and e-Medical Attendant visa for companions) - we send the hospital invitation letter.',
        'Printed copies of your visa, invitation letter, booking confirmation and medical reports.',
      ],
    ),
    (
      Icons.medical_information_outlined,
      'Medical records',
      [
        'Recent scans, lab results and prescriptions - upload them in Documents so your doctor can review them.',
        'A list of current medicines with doses; bring enough for the whole trip.',
        'Allergies and previous surgeries written down in English.',
      ],
    ),
    (
      Icons.luggage_outlined,
      'What to pack',
      [
        'Loose, comfortable clothing for after treatment.',
        'Universal power adapter (India uses type C, D and M plugs, 230 V).',
        'A light jacket - hospitals and flights are air-conditioned.',
      ],
    ),
    (
      Icons.payments_outlined,
      'Money',
      [
        'Cards are accepted at hospitals and hotels; keep some rupees for taxis and small shops.',
        'Tell your bank you are travelling to India so cards are not blocked.',
        'Keep your payment receipts in the app under Documents.',
      ],
    ),
    (
      Icons.flight_land_outlined,
      'Arrival day',
      [
        'Share your flight details so we can arrange the airport pickup.',
        'Your driver waits at arrivals with a Heal India Global sign.',
        'Save the 24/7 helpline number before you fly.',
      ],
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tips = ref.watch(culturalTipsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Pre-arrival Guide'), centerTitle: true),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        children: [
          for (final (icon, title, items) in _sections)
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
          const SectionTitle('Cultural tips'),
          tips.when(
            loading: () => const Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
            error: (e, _) => ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(culturalTipsProvider)),
            data: (list) => list.isEmpty
                ? Text('Tips will appear here soon.', style: context.text.bodyMedium)
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
            'General travel information only - always follow your doctor\'s instructions.',
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
        ],
      ),
    );
  }
}
