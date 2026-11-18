import '../utils/money.dart';

/// An immutable amount in integer minor units plus ISO-4217 currency.
class Money implements Comparable<Money> {
  const Money(this.minor, this.currency);

  /// Builds a [Money] from a major amount (e.g. `Money.fromMajor(12.5, 'USD')` -> 1250 minor).
  factory Money.fromMajor(num major, String currency) => Money(majorToMinor(major, currency), currency);

  /// Zero in [currency].
  factory Money.zero(String currency) => Money(0, currency);

  /// Reads an `<x>_minor` field plus `currency` from a JSON object,
  /// e.g. `Money.fromJsonField(json, 'total_minor')`.
  factory Money.fromJsonField(Map<String, dynamic> json, String minorKey, {String currencyKey = 'currency'}) {
    final raw = json[minorKey];
    final minor = raw is num ? raw.round() : int.tryParse('${raw ?? 0}') ?? 0;
    return Money(minor, (json[currencyKey] as String?) ?? 'USD');
  }

  final int minor;
  final String currency;

  double get major => minorToMajor(minor, currency);
  bool get isZero => minor == 0;
  bool get isNegative => minor < 0;

  Money operator +(Money other) {
    _assertSameCurrency(other);
    return Money(minor + other.minor, currency);
  }

  Money operator -(Money other) {
    _assertSameCurrency(other);
    return Money(minor - other.minor, currency);
  }

  /// Multiplies by an integer quantity (e.g. nights).
  Money times(int qty) => Money(minor * qty, currency);

  /// Applies a rate in basis points with half-up rounding (`1500` = 15%).
  Money applyBps(int bps) => Money((minor * bps / 10000).round(), currency);

  String format({bool? showDecimals, bool compact = false}) =>
      formatMoney(minor, currency, showDecimals: showDecimals, compact: compact);

  Map<String, dynamic> toJson({String amountKey = 'amount_minor'}) => {amountKey: minor, 'currency': currency};

  void _assertSameCurrency(Money other) {
    if (other.currency != currency) {
      throw ArgumentError('Currency mismatch: $currency vs ${other.currency}');
    }
  }

  @override
  int compareTo(Money other) {
    _assertSameCurrency(other);
    return minor.compareTo(other.minor);
  }

  @override
  bool operator ==(Object other) => other is Money && other.minor == minor && other.currency == currency;

  @override
  int get hashCode => Object.hash(minor, currency);

  @override
  String toString() => format();
}

/// `display_*` money from the API: an amount converted to the viewer's currency for display only
/// (`{amount_minor, currency, fx_rate, approximate}`). Payments always use the original amount.
class DisplayMoney {
  const DisplayMoney({required this.minor, required this.currency, this.fxRate, this.approximate = true});

  /// Reads `j[key]`; null when missing or malformed.
  static DisplayMoney? read(Map<String, dynamic> j, String key) {
    final v = j[key];
    if (v is! Map) return null;
    final m = v.map((k, value) => MapEntry(k.toString(), value));
    final raw = m['amount_minor'];
    final minor = raw is num ? raw.round() : int.tryParse('${raw ?? ''}');
    final ccy = m['currency'];
    if (minor == null || ccy is! String || ccy.length != 3) return null;
    final approx = m['approximate'];
    return DisplayMoney(
      minor: minor,
      currency: ccy.toUpperCase(),
      fxRate: m['fx_rate']?.toString(),
      approximate: approx is bool ? approx : true,
    );
  }

  final int minor;
  final String currency;
  final String? fxRate;
  final bool approximate;

  Money get money => Money(minor, currency);

  Map<String, dynamic> toJson() => {
    'amount_minor': minor,
    'currency': currency,
    'fx_rate': ?fxRate,
    'approximate': approximate,
  };
}
