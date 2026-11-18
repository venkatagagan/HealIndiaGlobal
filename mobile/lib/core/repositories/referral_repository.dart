import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../network/api_client.dart';
import 'guest_repository.dart';

/// Patient referral programme and referral credit (`/patient/referral`, `/patient/credits*`).
class ReferralRepository {
  ReferralRepository(this._api, {required this.deviceId});

  final ApiClient _api;

  /// Stable install id, sent as `X-Device-Id` (fraud checks: one install, one reward).
  final String deviceId;

  /// `GET /patient/referral` — code, share links, rewards, credit balance and the friends who joined.
  Future<ReferralOverview> overview() async =>
      ReferralOverview.fromJson(asJsonMap(await _api.get('/patient/referral', headers: {'X-Device-Id': deviceId})));

  /// `GET /patient/credits` — balance, credit grants and the ledger.
  Future<CreditsOverview> credits() async => CreditsOverview.fromJson(asJsonMap(await _api.get('/patient/credits')));

  /// `GET /patient/credits/preview?booking_id=&purpose=` — how much credit the pay screen can apply.
  Future<CreditPreview> preview({required String bookingId, required PaymentPurpose purpose}) async =>
      CreditPreview.fromJson(
        asJsonMap(
          await _api.get('/patient/credits/preview', query: {'booking_id': bookingId, 'purpose': purpose.json}),
        ),
      );

  /// `POST /patient/credits/apply {booking_id, purpose}` — pays as much of the payment as the credit covers.
  /// Errors: 400 `credit_not_applicable`, 409 `credit_changed` / `payment_in_progress`.
  Future<CreditApplyResult> apply({required String bookingId, required PaymentPurpose purpose}) async =>
      CreditApplyResult.fromJson(
        asJsonMap(await _api.post('/patient/credits/apply', data: {'booking_id': bookingId, 'purpose': purpose.json})),
      );
}

final referralRepositoryProvider = Provider<ReferralRepository>(
  (ref) => ReferralRepository(ref.watch(apiClientProvider), deviceId: ref.watch(deviceIdProvider)),
);

final referralOverviewProvider = FutureProvider.autoDispose<ReferralOverview>(
  (ref) => ref.watch(referralRepositoryProvider).overview(),
);

final creditsOverviewProvider = FutureProvider.autoDispose<CreditsOverview>(
  (ref) => ref.watch(referralRepositoryProvider).credits(),
);

/// Credit preview for one booking payment (`(bookingId, purpose)`).
final creditPreviewProvider = FutureProvider.autoDispose.family<CreditPreview, (String, PaymentPurpose)>(
  (ref, key) => ref.watch(referralRepositoryProvider).preview(bookingId: key.$1, purpose: key.$2),
);
