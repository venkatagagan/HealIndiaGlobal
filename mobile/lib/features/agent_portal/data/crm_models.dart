import '../../../core/models/models.dart';

/// Pipeline stage of a lead (in pipeline order).
enum LeadStatus with JsonEnum {
  newLead('new'),
  contacted('contacted'),
  qualified('qualified'),
  screening('screening'),
  quoteRequested('quote_requested'),
  won('won'),
  lost('lost');

  const LeadStatus(this.json);

  @override
  final String json;

  static LeadStatus fromJson(Object? raw) => enumFromJson(values, raw, LeadStatus.newLead);

  static LeadStatus? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);

  /// Stages a lead can still move through (not won / lost).
  bool get isOpen => this != won && this != lost;

  /// Stages an agent may pick by hand: open stages plus "lost" ("won" only through conversion).
  static const editable = [newLead, contacted, qualified, screening, quoteRequested, lost];

  /// Open stages, for creating a lead.
  static const open = [newLead, contacted, qualified, screening, quoteRequested];
}

/// Where the lead came from.
enum LeadSource with JsonEnum {
  walkIn('walk_in'),
  whatsapp('whatsapp'),
  facebook('facebook'),
  referral('referral'),
  event('event'),
  other('other');

  const LeadSource(this.json);

  @override
  final String json;

  static LeadSource fromJson(Object? raw) => enumFromJson(values, raw, LeadSource.other);
}

/// Timeline entry kind. Agents log [call], [message], [meeting] and [note]; [statusChange] is written
/// by the server.
enum LeadActivityKind with JsonEnum {
  call('call'),
  message('message'),
  meeting('meeting'),
  note('note'),
  statusChange('status_change');

  const LeadActivityKind(this.json);

  @override
  final String json;

  static LeadActivityKind fromJson(Object? raw) => enumFromJson(values, raw, LeadActivityKind.note);

  static const loggable = [call, message, meeting, note];
}

/// Follow-up filter of the lead list (`follow_up=due|overdue|none`).
enum LeadFollowUpFilter with JsonEnum {
  due('due'),
  overdue('overdue'),
  none('none');

  const LeadFollowUpFilter(this.json);

  @override
  final String json;

  static LeadFollowUpFilter? fromJsonOrNull(Object? raw) => enumFromJsonOrNull(values, raw);
}

/// One timeline entry (`ActivityOut`).
class LeadActivity {
  const LeadActivity({
    required this.id,
    required this.kind,
    this.body,
    this.fromStatus,
    this.toStatus,
    this.actorName,
    this.occurredAt,
    this.createdAt,
  });

  factory LeadActivity.fromJson(JsonMap j) => LeadActivity(
    id: jStr(j, 'id'),
    kind: LeadActivityKind.fromJson(j['kind']),
    body: jStrOrNull(j, 'body'),
    fromStatus: LeadStatus.fromJsonOrNull(j['from_status']),
    toStatus: LeadStatus.fromJsonOrNull(j['to_status']),
    actorName: jStrOrNull(j, 'actor_name'),
    occurredAt: jDate(j, 'occurred_at'),
    createdAt: jDate(j, 'created_at'),
  );

  final String id;
  final LeadActivityKind kind;
  final String? body;
  final LeadStatus? fromStatus;
  final LeadStatus? toStatus;
  final String? actorName;
  final DateTime? occurredAt;
  final DateTime? createdAt;
}

/// A prospective patient of the agency (`LeadOut`, plus `activities` for `LeadDetailOut`).
class Lead {
  const Lead({
    required this.id,
    required this.fullName,
    required this.status,
    required this.source,
    this.country,
    this.email,
    this.phone,
    this.whatsapp,
    this.preferredLanguage,
    this.sourceDetail,
    this.interestedSpecialtyName,
    this.interestedProcedureName,
    this.interest,
    this.budgetMinor,
    this.budgetCurrency,
    this.lostReason,
    this.nextFollowUpAt,
    this.followUpDue = false,
    this.lastActivityAt,
    this.ownerName,
    this.tags = const [],
    this.convertedPatientId,
    this.convertedAt,
    this.createdAt,
    this.activities = const [],
  });

  factory Lead.fromJson(JsonMap j) => Lead(
    id: jStr(j, 'id'),
    fullName: jStr(j, 'full_name'),
    status: LeadStatus.fromJson(j['status']),
    source: LeadSource.fromJson(j['source']),
    country: jStrOrNull(j, 'country'),
    email: jStrOrNull(j, 'email'),
    phone: jStrOrNull(j, 'phone'),
    whatsapp: jStrOrNull(j, 'whatsapp'),
    preferredLanguage: jStrOrNull(j, 'preferred_language'),
    sourceDetail: jStrOrNull(j, 'source_detail'),
    interestedSpecialtyName: jStrOrNull(j, 'interested_specialty_name'),
    interestedProcedureName: jStrOrNull(j, 'interested_procedure_name'),
    interest: jStrOrNull(j, 'interest'),
    budgetMinor: jIntOrNull(j, 'budget_minor'),
    budgetCurrency: jStrOrNull(j, 'budget_currency'),
    lostReason: jStrOrNull(j, 'lost_reason'),
    nextFollowUpAt: jDate(j, 'next_follow_up_at'),
    followUpDue: jBool(j, 'follow_up_due'),
    lastActivityAt: jDate(j, 'last_activity_at'),
    ownerName: jStrOrNull(j, 'owner_name'),
    tags: jStrList(j, 'tags'),
    convertedPatientId: jStrOrNull(j, 'converted_patient_id'),
    convertedAt: jDate(j, 'converted_at'),
    createdAt: jDate(j, 'created_at'),
    activities: parseList(j['activities'], LeadActivity.fromJson),
  );

  final String id;
  final String fullName;
  final LeadStatus status;
  final LeadSource source;

  /// ISO-3166 alpha-2.
  final String? country;
  final String? email;
  final String? phone;
  final String? whatsapp;
  final String? preferredLanguage;
  final String? sourceDetail;
  final String? interestedSpecialtyName;
  final String? interestedProcedureName;

  /// Short interest text (never medical history).
  final String? interest;
  final int? budgetMinor;
  final String? budgetCurrency;
  final String? lostReason;
  final DateTime? nextFollowUpAt;
  final bool followUpDue;
  final DateTime? lastActivityAt;
  final String? ownerName;
  final List<String> tags;
  final String? convertedPatientId;
  final DateTime? convertedAt;
  final DateTime? createdAt;

  /// Newest first (detail only).
  final List<LeadActivity> activities;

  bool get isConverted => convertedPatientId != null;

  /// First / last name for the patient form: the last word is the last name.
  (String, String) get splitName {
    final parts = fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return ('', '');
    if (parts.length == 1) return (parts.first, '');
    return (parts.sublist(0, parts.length - 1).join(' '), parts.last);
  }
}

/// Lead count of one pipeline stage.
class LeadStageCount {
  const LeadStageCount(this.status, this.count);

  factory LeadStageCount.fromJson(JsonMap j) => LeadStageCount(LeadStatus.fromJson(j['status']), jInt(j, 'count'));

  final LeadStatus status;
  final int count;
}

/// Leads and conversion of one source.
class LeadSourceStats {
  const LeadSourceStats({required this.source, this.total = 0, this.won = 0, this.lost = 0, this.conversionRate});

  factory LeadSourceStats.fromJson(JsonMap j) => LeadSourceStats(
    source: LeadSource.fromJson(j['source']),
    total: jInt(j, 'total'),
    won: jInt(j, 'won'),
    lost: jInt(j, 'lost'),
    conversionRate: jDoubleOrNull(j, 'conversion_rate'),
  );

  final LeadSource source;
  final int total;
  final int won;
  final int lost;
  final double? conversionRate;
}

/// `GET /agent-portal/leads/pipeline`.
class LeadPipeline {
  const LeadPipeline({
    this.total = 0,
    this.open = 0,
    this.stages = const [],
    this.sources = const [],
    this.won = 0,
    this.lost = 0,
    this.conversionRate,
    this.followUpsDueToday = 0,
    this.followUpsOverdue = 0,
    this.newThisMonth = 0,
  });

  factory LeadPipeline.fromJson(JsonMap j) => LeadPipeline(
    total: jInt(j, 'total'),
    open: jInt(j, 'open'),
    stages: parseList(j['stages'], LeadStageCount.fromJson),
    sources: parseList(j['sources'], LeadSourceStats.fromJson),
    won: jInt(j, 'won'),
    lost: jInt(j, 'lost'),
    conversionRate: jDoubleOrNull(j, 'conversion_rate'),
    followUpsDueToday: jInt(j, 'follow_ups_due_today'),
    followUpsOverdue: jInt(j, 'follow_ups_overdue'),
    newThisMonth: jInt(j, 'new_this_month'),
  );

  final int total;
  final int open;
  final List<LeadStageCount> stages;
  final List<LeadSourceStats> sources;
  final int won;
  final int lost;

  /// won / (won + lost), 0..1; null until something closed.
  final double? conversionRate;

  /// Open leads with a follow-up due by the end of today, overdue included.
  final int followUpsDueToday;
  final int followUpsOverdue;
  final int newThisMonth;

  int countOf(LeadStatus s) {
    for (final st in stages) {
      if (st.status == s) return st.count;
    }
    return 0;
  }
}

/// Filters of the lead list / pipeline (`status` is ignored by the pipeline).
class LeadFilters {
  const LeadFilters({this.status, this.source, this.followUp, this.q = ''});

  final LeadStatus? status;
  final LeadSource? source;
  final LeadFollowUpFilter? followUp;
  final String q;

  LeadFilters copyWith({
    LeadStatus? Function()? status,
    LeadSource? Function()? source,
    LeadFollowUpFilter? Function()? followUp,
    String? q,
  }) => LeadFilters(
    status: status == null ? this.status : status(),
    source: source == null ? this.source : source(),
    followUp: followUp == null ? this.followUp : followUp(),
    q: q ?? this.q,
  );

  Map<String, Object?> toQuery({bool withStatus = true}) => {
    if (withStatus) 'status': status?.json,
    'source': source?.json,
    'follow_up': followUp?.json,
    'q': q.isEmpty ? null : q,
  };

  @override
  bool operator ==(Object other) =>
      other is LeadFilters &&
      other.status == status &&
      other.source == source &&
      other.followUp == followUp &&
      other.q == q;

  @override
  int get hashCode => Object.hash(status, source, followUp, q);
}

/// Body of `POST /agent-portal/leads` and (only changed fields) `PATCH /agent-portal/leads/{id}`.
class LeadInput {
  const LeadInput({
    required this.fullName,
    this.country,
    this.email,
    this.phone,
    this.whatsapp,
    this.source,
    this.sourceDetail,
    this.interest,
    this.budgetMinor,
    this.budgetCurrency,
    this.nextFollowUpAt,
    this.note,
  });

  final String fullName;
  final String? country;
  final String? email;
  final String? phone;
  final String? whatsapp;
  final LeadSource? source;
  final String? sourceDetail;
  final String? interest;
  final int? budgetMinor;
  final String? budgetCurrency;
  final DateTime? nextFollowUpAt;

  /// First timeline note (create only).
  final String? note;

  JsonMap toCreateJson() => compactJson({
    'full_name': fullName.trim(),
    'country': country?.trim().toUpperCase(),
    'email': email?.trim(),
    'phone': phone?.trim(),
    'whatsapp': whatsapp?.trim(),
    'source': source?.json,
    'source_detail': sourceDetail?.trim(),
    'interest': interest?.trim(),
    'budget_minor': budgetMinor,
    'budget_currency': budgetMinor == null ? null : budgetCurrency?.trim().toUpperCase(),
    'next_follow_up_at': nextFollowUpAt?.toUtc().toIso8601String(),
    'note': note?.trim(),
  }, dropEmptyStrings: true);
}

/// How the agent obtained the patient's consent (`consent_method`).
enum AgentConsentMethod with JsonEnum {
  inPerson('in_person'),
  phone('phone'),
  videoCall('video_call'),
  written('written'),
  email('email');

  const AgentConsentMethod(this.json);

  @override
  final String json;
}

/// The agent's attestation that the patient consented (required by `POST /agent-portal/patients` and
/// `POST /agent-portal/leads/{id}/convert`). Terms and privacy are always included.
class AgentConsentAttestation {
  const AgentConsentAttestation({this.method = AgentConsentMethod.inPerson, this.shareWithHospitals = true, this.note});

  final AgentConsentMethod method;
  final bool shareWithHospitals;
  final String? note;

  JsonMap toJson() => compactJson({
    'consent_attested': true,
    'consent_kinds': [
      ConsentKind.terms.json,
      ConsentKind.privacy.json,
      if (shareWithHospitals) ConsentKind.shareWithHospitals.json,
    ],
    'consent_method': method.json,
    'consent_note': note?.trim(),
  }, dropEmptyStrings: true);
}
