/// Settlements seen by a payee (agent or hospital) — read-only (PLAN §8.12, §8.10).
///
/// Shared by both partner shells: agents see their commissions, hospitals their settlements.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_client.dart';
import 'portal_api.dart';

/// `SettlementItemOut`.
class SettlementItem {
  const SettlementItem({
    required this.id,
    required this.status,
    required this.currency,
    this.payeeName,
    this.bookingId,
    this.bookingNumber,
    this.grossMinor = 0,
    this.commissionMinor = 0,
    this.taxMinor = 0,
    this.tdsMinor = 0,
    this.netMinor = 0,
    this.eligibleAt,
    this.holdReason,
    this.createdAt,
  });

  factory SettlementItem.fromJson(JsonMap j) => SettlementItem(
    id: jStr(j, 'id'),
    status: jStr(j, 'status', 'pending'),
    currency: jStr(j, 'currency', 'INR'),
    payeeName: jStrOrNull(j, 'payee_name'),
    bookingId: jStrOrNull(j, 'booking_id'),
    bookingNumber: jStrOrNull(j, 'booking_number'),
    grossMinor: jInt(j, 'gross_minor'),
    commissionMinor: jInt(j, 'commission_minor'),
    taxMinor: jInt(j, 'tax_minor'),
    tdsMinor: jInt(j, 'tds_minor'),
    netMinor: jInt(j, 'net_minor'),
    eligibleAt: jDate(j, 'eligible_at'),
    holdReason: jStrOrNull(j, 'hold_reason'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String status;
  final String currency;
  final String? payeeName;
  final String? bookingId;
  final String? bookingNumber;
  final int grossMinor;
  final int commissionMinor;
  final int taxMinor;
  final int tdsMinor;
  final int netMinor;
  final DateTime? eligibleAt;
  final String? holdReason;
  final DateTime? createdAt;
}

/// `PayoutOut`.
class Payout {
  const Payout({
    required this.id,
    required this.status,
    required this.amountMinor,
    required this.currency,
    this.method,
    this.utr,
    this.failureReason,
    this.processedAt,
    this.createdAt,
  });

  factory Payout.fromJson(JsonMap j) => Payout(
    id: jStr(j, 'id'),
    status: jStr(j, 'status', 'queued'),
    amountMinor: jInt(j, 'amount_minor'),
    currency: jStr(j, 'currency', 'INR'),
    method: jStrOrNull(j, 'method'),
    utr: jStrOrNull(j, 'utr'),
    failureReason: jStrOrNull(j, 'failure_reason'),
    processedAt: jDate(j, 'processed_at'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String status;
  final int amountMinor;
  final String currency;
  final String? method;
  final String? utr;
  final String? failureReason;
  final DateTime? processedAt;
  final DateTime? createdAt;
}

/// `GET /finance/summary` for a hospital member / agent (`PayeeSummaryOut`).
class PayeeSummary {
  const PayeeSummary({
    required this.currency,
    this.pendingMinor = 0,
    this.eligibleMinor = 0,
    this.onHoldMinor = 0,
    this.batchedMinor = 0,
    this.paidMinor = 0,
    this.lastPayout,
    this.nextPayoutDate,
    this.settlementCycleDays,
  });

  factory PayeeSummary.fromJson(JsonMap j) => PayeeSummary(
    currency: jStr(j, 'currency', 'INR'),
    pendingMinor: jInt(j, 'pending_minor'),
    eligibleMinor: jInt(j, 'eligible_minor'),
    onHoldMinor: jInt(j, 'on_hold_minor'),
    batchedMinor: jInt(j, 'batched_minor'),
    paidMinor: jInt(j, 'paid_minor'),
    lastPayout: jObj(j, 'last_payout', Payout.fromJson),
    nextPayoutDate: jDay(j, 'next_payout_date'),
    settlementCycleDays: jIntOrNull(j, 'settlement_cycle_days'),
  );

  final String currency;
  final int pendingMinor;
  final int eligibleMinor;
  final int onHoldMinor;
  final int batchedMinor;
  final int paidMinor;
  final Payout? lastPayout;
  final DateTime? nextPayoutDate;
  final int? settlementCycleDays;

  /// Earned but not yet paid out.
  int get outstandingMinor => pendingMinor + eligibleMinor + onHoldMinor + batchedMinor;
}

/// One row of `GET /finance/statements`.
class StatementRow {
  const StatementRow({
    required this.kind,
    required this.description,
    required this.amountMinor,
    required this.balanceMinor,
    required this.status,
    this.date,
    this.reference,
    this.bookingNumber,
  });

  factory StatementRow.fromJson(JsonMap j) => StatementRow(
    kind: jStr(j, 'kind', 'earning'),
    description: jStr(j, 'description'),
    amountMinor: jInt(j, 'amount_minor'),
    balanceMinor: jInt(j, 'balance_minor'),
    status: jStr(j, 'status'),
    date: jDate(j, 'date'),
    reference: jStrOrNull(j, 'reference'),
    bookingNumber: jStrOrNull(j, 'booking_number'),
  );

  /// `earning | clawback | payout`.
  final String kind;
  final String description;

  /// Signed effect on the payee balance.
  final int amountMinor;
  final int balanceMinor;
  final String status;
  final DateTime? date;
  final String? reference;
  final String? bookingNumber;
}

/// `StatementOut`.
class PayeeStatement {
  const PayeeStatement({
    required this.currency,
    required this.rows,
    this.fromDate,
    this.toDate,
    this.openingBalanceMinor = 0,
    this.totalEarnedMinor = 0,
    this.totalPaidMinor = 0,
    this.closingBalanceMinor = 0,
  });

  factory PayeeStatement.fromJson(JsonMap j) => PayeeStatement(
    currency: jStr(j, 'currency', 'INR'),
    rows: jList(j, 'rows', StatementRow.fromJson),
    fromDate: jDay(j, 'from_date'),
    toDate: jDay(j, 'to_date'),
    openingBalanceMinor: jInt(j, 'opening_balance_minor'),
    totalEarnedMinor: jInt(j, 'total_earned_minor'),
    totalPaidMinor: jInt(j, 'total_paid_minor'),
    closingBalanceMinor: jInt(j, 'closing_balance_minor'),
  );

  final String currency;
  final List<StatementRow> rows;
  final DateTime? fromDate;
  final DateTime? toDate;
  final int openingBalanceMinor;
  final int totalEarnedMinor;
  final int totalPaidMinor;
  final int closingBalanceMinor;
}

/// Read-only finance endpoints for the signed-in payee.
class PayeeFinanceRepository {
  PayeeFinanceRepository(this._api, {this.headers = const {}, this.itemsPath = '/finance/settlements/items'});

  final ApiClient _api;
  final Map<String, String> headers;

  /// Agents use `/agent-portal/commissions` (same `SettlementItemOut` shape).
  final String itemsPath;

  /// `GET /finance/summary`
  Future<PayeeSummary> summary() async =>
      PayeeSummary.fromJson(asJsonMap(await portalSend(_api, 'GET', '/finance/summary', headers: headers)));

  /// Settlement items / commissions, newest first.
  Future<Paged<SettlementItem>> items({String? status, int page = 1, int pageSize = 50}) async => Paged.fromJson(
    await portalSend(
      _api,
      'GET',
      itemsPath,
      query: {'status': status, 'page': page, 'page_size': pageSize},
      headers: headers,
    ),
    SettlementItem.fromJson,
  );

  /// `GET /finance/settlements/payouts`
  Future<Paged<Payout>> payouts({int page = 1, int pageSize = 50}) async => Paged.fromJson(
    await portalSend(
      _api,
      'GET',
      '/finance/settlements/payouts',
      query: {'page': page, 'page_size': pageSize},
      headers: headers,
    ),
    Payout.fromJson,
  );

  /// `GET /finance/statements?from=&to=`
  Future<PayeeStatement> statement({required DateTime from, required DateTime to}) async => PayeeStatement.fromJson(
    asJsonMap(await portalSend(_api, 'GET', '/finance/statements', query: {'from': from, 'to': to}, headers: headers)),
  );
}

final payeeFinanceRepositoryProvider = Provider<PayeeFinanceRepository>((ref) {
  final isAgent = ref.watch(currentUserProvider)?.role == UserRole.agent;
  return PayeeFinanceRepository(
    ref.watch(apiClientProvider),
    headers: ref.watch(portalHeadersProvider),
    itemsPath: isAgent ? '/agent-portal/commissions' : '/finance/settlements/items',
  );
});

final payeeSummaryProvider = FutureProvider.autoDispose<PayeeSummary>(
  (ref) => ref.watch(payeeFinanceRepositoryProvider).summary(),
);

/// Settlement items filtered by status (null = all).
final settlementItemsProvider = FutureProvider.autoDispose.family<Paged<SettlementItem>, String?>(
  (ref, status) => ref.watch(payeeFinanceRepositoryProvider).items(status: status),
);

final payoutsProvider = FutureProvider.autoDispose<Paged<Payout>>(
  (ref) => ref.watch(payeeFinanceRepositoryProvider).payouts(),
);

/// Statement for the last N days (key = number of days).
final statementProvider = FutureProvider.autoDispose.family<PayeeStatement, int>((ref, days) {
  final now = DateTime.now();
  final to = DateTime(now.year, now.month, now.day);
  return ref
      .watch(payeeFinanceRepositoryProvider)
      .statement(
        from: to.subtract(Duration(days: days)),
        to: to,
      );
});
