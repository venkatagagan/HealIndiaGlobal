import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../config/app_preferences.dart';
import '../models/money.dart';
import '../repositories/catalog_repository.dart';
import '../theme/app_theme.dart';
import '../utils/money.dart';
import 'money_text.dart';

/// A price in the patient's currency: "≈ $3,010" with the original amount ("₹2,50,000") in small text.
///
/// Uses the server's `display_*` amount ([display] / [displayMax]) when the API sent one. Only when it did
/// not (older endpoints) does it fall back to a client-side estimate from `/content/fx-rates`. When the
/// display currency equals the original, the plain amount is shown.
class PriceText extends ConsumerWidget {
  const PriceText(
    this.minor,
    this.currency, {
    super.key,
    this.maxMinor,
    this.display,
    this.displayMax,
    this.style,
    this.prefix = '',
    this.showOriginal = true,
    this.textAlign,
    this.crossAxisAlignment = CrossAxisAlignment.start,
  });

  /// Original amount (what the hospital charges) in minor units of [currency].
  final int minor;
  final int? maxMinor;
  final String currency;
  final DisplayMoney? display;
  final DisplayMoney? displayMax;
  final TextStyle? style;

  /// Text before the amount ("From ").
  final String prefix;

  /// Show the original amount under the converted one.
  final bool showOriginal;
  final TextAlign? textAlign;
  final CrossAxisAlignment crossAxisAlignment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final from = currency.toUpperCase();
    final converted = _converted(ref, from);
    if (converted == null) {
      return MoneyText(minor, from, maxMinor: maxMinor, style: style, prefix: prefix, textAlign: textAlign);
    }
    final (lo, hi, to) = converted;
    final original = formatMoneyRange(minor, maxMinor ?? minor, from);
    final approx = formatMoneyRange(lo, hi ?? lo, to);
    final l10n = context.l10n;
    final main = MoneyText(lo, to, maxMinor: hi, style: style, prefix: '$prefix≈ ', textAlign: textAlign);
    return Semantics(
      label: '$prefix${l10n.priceApproxSemantics(approx, original)}',
      excludeSemantics: true,
      child: Tooltip(
        message: l10n.catalogApproxPriceTooltip(original),
        child: !showOriginal
            ? main
            : Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: crossAxisAlignment,
                children: [
                  main,
                  Text(
                    l10n.priceOriginalAmount(original),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: textAlign,
                    style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
                  ),
                ],
              ),
      ),
    );
  }

  /// `(min, max, currency)` in the display currency, or null when no conversion applies.
  (int, int?, String)? _converted(WidgetRef ref, String from) {
    final d = display;
    if (d != null) {
      if (d.currency == from) return null;
      final hi = maxMinor == null ? null : (displayMax?.currency == d.currency ? displayMax!.minor : null);
      if (maxMinor != null && hi == null) return null;
      return (d.minor, hi, d.currency);
    }
    // Fallback: client-side estimate (only when the API sent no display amount).
    final preferred = ref.watch(preferredCurrencyProvider).toUpperCase();
    if (preferred == from) return null;
    final fx = ref.watch(fxRatesProvider).value;
    if (fx == null) return null;
    final known = (from == 'INR' || fx.containsKey(from)) && (preferred == 'INR' || fx.containsKey(preferred));
    if (!known) return null;
    return (
      convertMinor(minor, from, preferred, fx),
      maxMinor == null ? null : convertMinor(maxMinor!, from, preferred, fx),
      preferred,
    );
  }
}
