import 'package:flutter_test/flutter_test.dart';
import 'package:heal_india_global/core/config/env.dart';
import 'package:heal_india_global/core/models/money.dart';
import 'package:heal_india_global/core/utils/dates.dart';
import 'package:heal_india_global/core/utils/money.dart';

void main() {
  test('currency exponents', () {
    expect(Currencies.exponent('USD'), 2);
    expect(Currencies.exponent('jpy'), 0);
    expect(Currencies.exponent('KWD'), 3);
    expect(majorToMinor(12.5, 'USD'), 1250);
    expect(majorToMinor(1.234, 'OMR'), 1234);
    expect(minorToMajor(1500, 'JPY'), 1500);
  });

  test('formatMoney hides zero fractions and keeps real ones', () {
    expect(formatMoney(1250000, 'USD'), r'$12,500');
    expect(formatMoney(1250050, 'USD'), r'$12,500.50');
    expect(formatMoney(1250000, 'USD', showDecimals: true), r'$12,500.00');
    expect(formatMoneyRange(1500000, 3000000, 'USD'), r'$15,000 - $30,000');
    expect(formatBps(1500), '15%');
    expect(formatBps(125), '1.25%');
  });

  test('Money arithmetic', () {
    const a = Money(1000, 'USD');
    expect((a + const Money(250, 'USD')).minor, 1250);
    expect(a.applyBps(1500).minor, 150);
    expect(() => a + const Money(1, 'EUR'), throwsArgumentError);
    expect(Money.fromJsonField({'total_minor': 500, 'currency': 'INR'}, 'total_minor'), const Money(500, 'INR'));
  });

  test('convertMinor uses INR-per-unit rates', () {
    final rates = {'USD': 83.0, 'AED': 22.6};
    expect(convertMinor(100, 'USD', 'USD', rates), 100);
    expect(convertMinor(100, 'USD', 'INR', rates), 8300);
    expect(convertMinor(8300, 'INR', 'USD', rates), 100);
  });

  test('dates', () {
    final now = DateTime(2026, 10, 21, 18);
    expect(Dates.daysUntil(DateTime(2026, 11, 13, 1), now: now), 23);
    expect(Dates.age(DateTime(1980, 12, 1), now: now), 45);
    expect(Dates.api(DateTime(2026, 1, 5)), '2026-01-05');
    expect(Dates.relative(now.subtract(const Duration(minutes: 5)), now: now), '5 min ago');
  });

  test('ws url is derived from the api base url', () {
    expect(Env.deriveWsUrl('http://10.0.2.2:8000/api/v1'), 'ws://10.0.2.2:8000/api/v1/ws');
    expect(Env.deriveWsUrl('https://api.example.com/api/v1/'), 'wss://api.example.com/api/v1/ws');
  });
}
