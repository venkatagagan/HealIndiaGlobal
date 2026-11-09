import 'package:intl/intl.dart';

/// Currency helpers. All amounts in the API are integer **minor units** (`*_minor`) plus an ISO-4217
/// currency (PLAN §3). Never use doubles for arithmetic; only convert for display.
abstract final class Currencies {
  /// Minor-unit exponents that differ from the default of 2.
  static const Map<String, int> exponents = {'JPY': 0, 'KRW': 0, 'KWD': 3, 'BHD': 3, 'OMR': 3};

  /// Currencies the platform accepts (mirrors the `supported_currencies` platform setting default).
  static const List<String> supported = [
    'USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR', 'NGN', 'KES', 'BDT', 'AUD', 'CAD', 'OMR', 'QAR', 'KWD', //
  ];

  /// Number of decimal digits of [currency] (0 for JPY/KRW, 3 for KWD/BHD/OMR, else 2).
  static int exponent(String currency) => exponents[currency.toUpperCase()] ?? 2;

  static int _pow10(int e) {
    var r = 1;
    for (var i = 0; i < e; i++) {
      r *= 10;
    }
    return r;
  }

  /// Multiplier between major and minor units (100 for USD).
  static int factor(String currency) => _pow10(exponent(currency));
}

/// Converts minor units to a major-unit double for display only.
double minorToMajor(int minor, String currency) => minor / Currencies.factor(currency);

/// Converts a major amount (e.g. user input `12.5`) to minor units with half-up rounding.
int majorToMinor(num major, String currency) => (major * Currencies.factor(currency)).round();

/// Formats minor units with the currency symbol, e.g. `formatMoney(1250000, 'USD')` -> `$12,500`.
///
/// * [showDecimals] `null` (default) hides the fraction when it is zero.
/// * [compact] renders `$12.5K` style values (used on small cards and slider labels).
/// * [locale] defaults to the app language (`Intl.defaultLocale`); the currency stays [currency].
String formatMoney(int minor, String currency, {bool? showDecimals, bool compact = false, String? locale}) {
  final ccy = currency.toUpperCase();
  final exp = Currencies.exponent(ccy);
  final major = minorToMajor(minor, ccy);
  if (compact) {
    final f = NumberFormat.compactSimpleCurrency(locale: locale, name: ccy);
    return f.format(major);
  }
  final hasFraction = minor % Currencies.factor(ccy) != 0;
  final digits = (showDecimals ?? hasFraction) ? exp : 0;
  final f = NumberFormat.simpleCurrency(locale: locale, name: ccy, decimalDigits: digits);
  return f.format(major);
}

/// Formats a min-max range, e.g. `$15,000 - $30,000`.
String formatMoneyRange(int minMinor, int maxMinor, String currency, {bool compact = false}) {
  if (minMinor == maxMinor) return formatMoney(minMinor, currency, compact: compact);
  return '${formatMoney(minMinor, currency, compact: compact)} - ${formatMoney(maxMinor, currency, compact: compact)}';
}

/// Formats basis points as a percentage (`1500` -> `15%`).
String formatBps(int bps) {
  final pct = bps / 100;
  return pct == pct.roundToDouble() ? '${pct.round()}%' : '${pct.toStringAsFixed(2)}%';
}

/// Converts [minor] between currencies with an FX table expressed as INR per 1 unit of the currency
/// (as returned by `/content/fx-rates`). Display-only estimate; the server is authoritative.
int convertMinor(int minor, String from, String to, Map<String, double> inrPerUnit) {
  final f = from.toUpperCase();
  final t = to.toUpperCase();
  if (f == t) return minor;
  final fromRate = f == 'INR' ? 1.0 : inrPerUnit[f];
  final toRate = t == 'INR' ? 1.0 : inrPerUnit[t];
  if (fromRate == null || toRate == null || toRate == 0) return minor;
  final inr = minorToMajor(minor, f) * fromRate;
  return majorToMinor(inr / toRate, t);
}
