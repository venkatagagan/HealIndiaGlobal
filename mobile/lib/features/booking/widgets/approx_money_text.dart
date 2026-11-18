import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_preferences.dart';
import '../../../core/models/money.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/money.dart';

/// "≈ $3,010" in the patient's currency under an amount the hospital charges.
///
/// Uses the server's `display_*` amount ([display]) when the API sent one; otherwise a display-only estimate
/// from `/content/fx-rates`. Renders nothing when the currencies match or no rate is known.
class ApproxMoneyText extends ConsumerWidget {
  const ApproxMoneyText(this.minor, this.currency, {super.key, this.style, this.display});

  final int minor;
  final String currency;
  final TextStyle? style;
  final DisplayMoney? display;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final from = currency.toUpperCase();
    final textStyle = style ?? context.text.labelSmall?.copyWith(color: context.palette.textSecondary);
    final d = display;
    if (d != null) {
      if (d.currency == from) return const SizedBox.shrink();
      return Text('≈ ${formatMoney(d.minor, d.currency)}', style: textStyle);
    }
    final to = ref.watch(preferredCurrencyProvider).toUpperCase();
    if (to == from) return const SizedBox.shrink();
    final rates = ref.watch(fxRatesProvider).value;
    if (rates == null) return const SizedBox.shrink();
    final known = (from == 'INR' || rates.containsKey(from)) && (to == 'INR' || rates.containsKey(to));
    if (!known) return const SizedBox.shrink();
    return Text('≈ ${formatMoney(convertMinor(minor, from, to, rates), to)}', style: textStyle);
  }
}
