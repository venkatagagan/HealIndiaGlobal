import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_preferences.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';

/// "≈ $3,010" in the patient's preferred currency (display-only estimate from `/content/fx-rates`).
/// Renders nothing when the currencies match or no rate is known.
class ApproxMoneyText extends ConsumerWidget {
  const ApproxMoneyText(this.minor, this.currency, {super.key, this.style});

  final int minor;
  final String currency;
  final TextStyle? style;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final target = ref.watch(preferredCurrencyProvider);
    if (target.toUpperCase() == currency.toUpperCase()) return const SizedBox.shrink();
    final rates = ref.watch(fxRatesProvider).value;
    if (rates == null) return const SizedBox.shrink();
    final from = currency.toUpperCase();
    final to = target.toUpperCase();
    final known = (from == 'INR' || rates.containsKey(from)) && (to == 'INR' || rates.containsKey(to));
    if (!known) return const SizedBox.shrink();
    final converted = convertMinor(minor, from, to, rates);
    return Text(
      '≈ ${formatMoney(converted, to)}',
      style: style ?? context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
    );
  }
}
