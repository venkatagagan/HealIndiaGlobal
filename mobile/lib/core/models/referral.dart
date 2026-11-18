import 'enums.dart';
import 'json.dart';

/// Status of a friend who signed up with the patient's referral code.
enum ReferralStatus with JsonEnum {
  pending('pending'),
  qualified('qualified'),
  rewarded('rewarded'),
  voided('void');

  const ReferralStatus(this.json);

  @override
  final String json;

  static ReferralStatus fromJson(Object? raw) => enumFromJson(values, raw, ReferralStatus.pending);
}

/// Origin of a referral credit.
enum CreditKind with JsonEnum {
  referrerReward('referrer_reward'),
  refereeReward('referee_reward'),
  reinstated('reinstated');

  const CreditKind(this.json);

  @override
  final String json;

  static CreditKind fromJson(Object? raw) => enumFromJson(values, raw, CreditKind.referrerReward);
}

enum CreditStatus with JsonEnum {
  active('active'),
  used('used'),
  expired('expired'),
  voided('void');

  const CreditStatus(this.json);

  @override
  final String json;

  static CreditStatus fromJson(Object? raw) => enumFromJson(values, raw, CreditStatus.active);
}

/// One line of the credit ledger.
enum CreditMovementKind with JsonEnum {
  grant('grant'),
  redeem('redeem'),
  reinstate('reinstate'),
  expire('expire'),
  voided('void');

  const CreditMovementKind(this.json);

  @override
  final String json;

  static CreditMovementKind fromJson(Object? raw) => enumFromJson(values, raw, CreditMovementKind.grant);
}

/// `{amount_minor, currency}`.
class MoneyAmount {
  const MoneyAmount(this.amountMinor, this.currency);

  static MoneyAmount? fromJsonOrNull(Object? raw) {
    final j = asJsonMapOrNull(raw);
    if (j == null) return null;
    return MoneyAmount(jInt(j, 'amount_minor'), jStr(j, 'currency', 'USD'));
  }

  final int amountMinor;
  final String currency;
}

/// `CreditBalanceOut`: the credit left, in INR (`base_*`) and in the patient's display currency.
class CreditBalance {
  const CreditBalance({
    required this.amountMinor,
    required this.currency,
    this.baseAmountMinor = 0,
    this.baseCurrency = 'INR',
    this.expiringSoonMinor = 0,
    this.nextExpiryAt,
  });

  factory CreditBalance.fromJson(JsonMap j) => CreditBalance(
    amountMinor: jInt(j, 'amount_minor'),
    currency: jStr(j, 'currency', 'INR'),
    baseAmountMinor: jInt(j, 'base_amount_minor'),
    baseCurrency: jStr(j, 'base_currency', 'INR'),
    expiringSoonMinor: jInt(j, 'expiring_soon_minor'),
    nextExpiryAt: jDate(j, 'next_expiry_at'),
  );

  static const empty = CreditBalance(amountMinor: 0, currency: 'INR');

  final int amountMinor;
  final String currency;
  final int baseAmountMinor;
  final String baseCurrency;

  /// Credit (in [currency]) expiring within 30 days.
  final int expiringSoonMinor;
  final DateTime? nextExpiryAt;

  bool get hasCredit => amountMinor > 0 || baseAmountMinor > 0;
}

/// `ReferralRewardInfo`: what the referrer and the friend each get.
class ReferralRewards {
  const ReferralRewards({this.referrer, this.referee, this.maxRewardsPerYear = 0, this.creditValidityDays = 0});

  factory ReferralRewards.fromJson(JsonMap j) => ReferralRewards(
    referrer: MoneyAmount.fromJsonOrNull(j['referrer']),
    referee: MoneyAmount.fromJsonOrNull(j['referee']),
    maxRewardsPerYear: jInt(j, 'max_rewards_per_year'),
    creditValidityDays: jInt(j, 'credit_validity_days'),
  );

  final MoneyAmount? referrer;
  final MoneyAmount? referee;
  final int maxRewardsPerYear;
  final int creditValidityDays;
}

/// A friend who used the code (first name + initial only).
class ReferredFriend {
  const ReferredFriend({
    required this.id,
    required this.friendName,
    required this.status,
    this.createdAt,
    this.rewardedAt,
    this.reward,
  });

  factory ReferredFriend.fromJson(JsonMap j) => ReferredFriend(
    id: jStr(j, 'id'),
    friendName: jStr(j, 'friend_name'),
    status: ReferralStatus.fromJson(j['status']),
    createdAt: jDate(j, 'created_at'),
    rewardedAt: jDate(j, 'rewarded_at'),
    reward: MoneyAmount.fromJsonOrNull(j['reward']),
  );

  final String id;
  final String friendName;
  final ReferralStatus status;
  final DateTime? createdAt;
  final DateTime? rewardedAt;
  final MoneyAmount? reward;
}

/// `GET /patient/referral`.
class ReferralOverview {
  const ReferralOverview({
    required this.enabled,
    required this.rewards,
    required this.credit,
    this.code,
    this.shareUrl,
    this.patientWebUrl,
    this.appUrl,
    this.counts = const {},
    this.referrals = const [],
  });

  factory ReferralOverview.fromJson(JsonMap j) => ReferralOverview(
    enabled: jBool(j, 'enabled'),
    code: jStrOrNull(j, 'code'),
    shareUrl: jStrOrNull(j, 'share_url'),
    patientWebUrl: jStrOrNull(j, 'patient_web_url'),
    appUrl: jStrOrNull(j, 'app_url'),
    rewards: ReferralRewards.fromJson(jMap(j, 'rewards')),
    credit: CreditBalance.fromJson(jMap(j, 'credit')),
    counts: {for (final e in jMap(j, 'counts').entries) e.key: jInt(jMap(j, 'counts'), e.key)},
    referrals: parseList(j['referrals'], ReferredFriend.fromJson),
  );

  final bool enabled;
  final String? code;

  /// Website link (`https://site/?ref=CODE`) — the one to share.
  final String? shareUrl;
  final String? patientWebUrl;

  /// App deep link (`healindia://register?ref=CODE`).
  final String? appUrl;
  final ReferralRewards rewards;
  final CreditBalance credit;

  /// Friends by status (`pending`, `qualified`, `rewarded`, `void`).
  final Map<String, int> counts;
  final List<ReferredFriend> referrals;

  int count(ReferralStatus s) => counts[s.json] ?? 0;
}

/// One credit grant (`CreditOut`). `amount_minor` / `remaining_minor` are INR; `display_*` the patient's currency.
class PatientCredit {
  const PatientCredit({
    required this.id,
    required this.kind,
    required this.status,
    required this.amountMinor,
    required this.remainingMinor,
    required this.currency,
    required this.displayRemainingMinor,
    required this.displayCurrency,
    this.originalAmountMinor,
    this.originalCurrency,
    this.expiresAt,
    this.createdAt,
  });

  factory PatientCredit.fromJson(JsonMap j) => PatientCredit(
    id: jStr(j, 'id'),
    kind: CreditKind.fromJson(j['kind']),
    status: CreditStatus.fromJson(j['status']),
    amountMinor: jInt(j, 'amount_minor'),
    remainingMinor: jInt(j, 'remaining_minor'),
    currency: jStr(j, 'currency', 'INR'),
    displayRemainingMinor: jInt(j, 'display_remaining_minor', jInt(j, 'remaining_minor')),
    displayCurrency: jStr(j, 'display_currency', jStr(j, 'currency', 'INR')),
    originalAmountMinor: jIntOrNull(j, 'original_amount_minor'),
    originalCurrency: jStrOrNull(j, 'original_currency'),
    expiresAt: jDate(j, 'expires_at'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final CreditKind kind;
  final CreditStatus status;
  final int amountMinor;
  final int remainingMinor;
  final String currency;
  final int displayRemainingMinor;
  final String displayCurrency;
  final int? originalAmountMinor;
  final String? originalCurrency;
  final DateTime? expiresAt;
  final DateTime? createdAt;
}

/// One ledger movement (`CreditMovementOut`).
class CreditMovement {
  const CreditMovement({
    required this.id,
    required this.creditId,
    required this.kind,
    required this.amountMinor,
    required this.displayAmountMinor,
    required this.displayCurrency,
    this.bookingId,
    this.paymentId,
    this.createdAt,
  });

  factory CreditMovement.fromJson(JsonMap j) => CreditMovement(
    id: jStr(j, 'id'),
    creditId: jStr(j, 'credit_id'),
    kind: CreditMovementKind.fromJson(j['kind']),
    amountMinor: jInt(j, 'amount_minor'),
    displayAmountMinor: jInt(j, 'display_amount_minor', jInt(j, 'amount_minor')),
    displayCurrency: jStr(j, 'display_currency', 'INR'),
    bookingId: jStrOrNull(j, 'booking_id'),
    paymentId: jStrOrNull(j, 'payment_id'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final String creditId;
  final CreditMovementKind kind;
  final int amountMinor;
  final int displayAmountMinor;
  final String displayCurrency;
  final String? bookingId;
  final String? paymentId;
  final DateTime? createdAt;

  /// Grants and reinstatements add credit; redemptions, expiries and voids take it away.
  bool get isIncoming => kind == CreditMovementKind.grant || kind == CreditMovementKind.reinstate;
}

/// `GET /patient/credits`.
class CreditsOverview {
  const CreditsOverview({required this.balance, this.credits = const [], this.movements = const []});

  factory CreditsOverview.fromJson(JsonMap j) => CreditsOverview(
    balance: CreditBalance.fromJson(jMap(j, 'balance')),
    credits: parseList(j['credits'], PatientCredit.fromJson),
    movements: parseList(j['movements'], CreditMovement.fromJson),
  );

  final CreditBalance balance;
  final List<PatientCredit> credits;
  final List<CreditMovement> movements;
}

/// Why credit cannot be used on a payment (`CreditPreviewOut.reason`).
enum CreditUnavailableReason with JsonEnum {
  installments('installments'),
  nothingDue('nothing_due'),
  noCredit('no_credit'),
  amountTooSmall('amount_too_small'),
  programmeOff('programme_off');

  const CreditUnavailableReason(this.json);

  @override
  final String json;

  static CreditUnavailableReason? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// `GET /patient/credits/preview?booking_id=&purpose=`: amounts in the booking currency.
class CreditPreview {
  const CreditPreview({
    required this.bookingId,
    required this.purpose,
    required this.currency,
    required this.dueMinor,
    required this.availableMinor,
    required this.applyMinor,
    required this.remainingDueMinor,
    required this.applicable,
    this.availableBaseMinor = 0,
    this.baseCurrency = 'INR',
    this.reason,
  });

  factory CreditPreview.fromJson(JsonMap j) => CreditPreview(
    bookingId: jStr(j, 'booking_id'),
    purpose: PaymentPurpose.fromJson(j['purpose']),
    currency: jStr(j, 'currency', 'USD'),
    dueMinor: jInt(j, 'due_minor'),
    availableMinor: jInt(j, 'available_minor'),
    availableBaseMinor: jInt(j, 'available_base_minor'),
    baseCurrency: jStr(j, 'base_currency', 'INR'),
    applyMinor: jInt(j, 'apply_minor'),
    remainingDueMinor: jInt(j, 'remaining_due_minor'),
    applicable: jBool(j, 'applicable'),
    reason: CreditUnavailableReason.fromJsonOrNull(j['reason']),
  );

  final String bookingId;
  final PaymentPurpose purpose;
  final String currency;
  final int dueMinor;
  final int availableMinor;
  final int availableBaseMinor;
  final String baseCurrency;
  final int applyMinor;
  final int remainingDueMinor;
  final bool applicable;
  final CreditUnavailableReason? reason;

  /// Applying the credit pays the whole amount due.
  bool get coversAll => applicable && remainingDueMinor <= 0;
}

/// `POST /patient/credits/apply` result.
class CreditApplyResult {
  const CreditApplyResult({
    required this.orderId,
    required this.orderNumber,
    required this.paymentId,
    required this.appliedMinor,
    required this.currency,
    required this.remainingDueMinor,
    required this.balance,
    this.appliedBaseMinor = 0,
  });

  factory CreditApplyResult.fromJson(JsonMap j) => CreditApplyResult(
    orderId: jStr(j, 'order_id'),
    orderNumber: jStr(j, 'order_number'),
    paymentId: jStr(j, 'payment_id'),
    appliedMinor: jInt(j, 'applied_minor'),
    currency: jStr(j, 'currency', 'USD'),
    appliedBaseMinor: jInt(j, 'applied_base_minor'),
    remainingDueMinor: jInt(j, 'remaining_due_minor'),
    balance: CreditBalance.fromJson(jMap(j, 'credit')),
  );

  final String orderId;
  final String orderNumber;
  final String paymentId;
  final int appliedMinor;
  final String currency;
  final int appliedBaseMinor;
  final int remainingDueMinor;
  final CreditBalance balance;

  bool get isPaidInFull => remainingDueMinor <= 0;
}

/// Normalizes a referral code typed or received in a link: upper case, `A-Z0-9` only, at most 16
/// characters. Null when nothing usable is left.
String? normalizeReferralCode(String? raw) {
  if (raw == null) return null;
  final code = raw.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
  if (code.length < 3) return null;
  return code.length > 16 ? code.substring(0, 16) : code;
}
