import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../profile/data/countries.dart';
import 'catalog_cards.dart';
import 'save_button.dart';

/// Procedure details as a bottom sheet (there is no procedure route): stay, India price range,
/// home-country benchmark, then Compare costs / Get matched.
Future<void> showProcedureSheet(BuildContext context, Procedure procedure) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => ProcedureSheet(slug: procedure.slug, preview: procedure),
);

class ProcedureSheet extends ConsumerWidget {
  const ProcedureSheet({super.key, required this.slug, required this.preview});

  final String slug;

  /// List data shown until the detail (with benchmarks) loads.
  final Procedure preview;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = ref.watch(procedureDetailProvider(slug)).value ?? preview;
    final country = (ref.watch(currentUserProvider)?.countryCode ?? 'US').toUpperCase();
    final currency = ref.watch(preferredCurrencyProvider);
    final benchmark = p.benchmarkFor(country) ?? (p.benchmarks.isEmpty ? null : p.benchmarks.first);

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (context, controller) => ListView(
        controller: controller,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(p.name, style: context.text.titleLarge)),
              SaveButton(entityType: SavedEntityType.procedure, entityId: p.id),
            ],
          ),
          if (p.specialty != null) Text(p.specialty!.name, style: context.text.bodySmall),
          if ((p.description ?? '').isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(p.description!, style: context.text.bodyMedium),
          ],
          const SizedBox(height: 16),
          AppCard(
            child: Row(
              children: [
                InfoStat(
                  icon: Icons.local_hotel_outlined,
                  value: p.hospitalStayDays == null ? '-' : '${p.hospitalStayDays} days',
                  label: 'In hospital',
                ),
                InfoStat(
                  icon: Icons.healing_outlined,
                  value: p.recoveryDays == null ? '-' : '${p.recoveryDays} days',
                  label: 'Recovery',
                ),
                InfoStat(
                  icon: Icons.flight_outlined,
                  value: p.totalStayDays == null ? '-' : '${p.totalStayDays} days',
                  label: 'Total stay in India',
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (p.indiaPriceMinMinor != null)
            AppCard(
              selected: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Treatment in India', style: context.text.labelMedium),
                  const SizedBox(height: 4),
                  ApproxPrice(
                    p.indiaPriceMinMinor!,
                    p.currency,
                    maxMinor: p.indiaPriceMaxMinor,
                    style: AppTextStyles.price(AppColors.primary, size: 22),
                  ),
                  if (benchmark != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      'Typical cost in ${countryName(benchmark.countryCode)}',
                      style: context.text.labelMedium,
                    ),
                    MoneyText(
                      benchmark.costMinMinor,
                      benchmark.currency,
                      maxMinor: benchmark.costMaxMinor,
                      style: context.text.titleMedium?.copyWith(color: AppColors.danger),
                    ),
                    if (benchmark.waitTimeText != null)
                      Text('Wait time: ${benchmark.waitTimeText}', style: context.text.bodySmall),
                  ],
                ],
              ),
            ),
          const SizedBox(height: 20),
          PrimaryButton(
            label: 'Compare costs',
            icon: Icons.compare_arrows_rounded,
            onPressed: () {
              final router = GoRouter.of(context);
              Navigator.of(context).pop();
              router.push(Routes.costComparisonFor(procedure: p.slug, country: country, currency: currency));
            },
          ),
          const SizedBox(height: 10),
          SecondaryButton(
            label: 'Get matched',
            icon: Icons.auto_awesome_outlined,
            onPressed: () {
              final router = GoRouter.of(context);
              Navigator.of(context).pop();
              router.push(Routes.screeningStart(specialty: p.specialty?.slug));
            },
          ),
        ],
      ),
    );
  }
}
