import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../models/json.dart';
import '../network/api_client.dart';

/// What is being reported (`POST /reports` `target_type`).
enum ReportTargetType {
  message('message'),
  screeningResult('screening_result'),
  documentAnalysis('document_analysis');

  const ReportTargetType(this.json);

  final String json;
}

/// Why it is reported (`POST /reports` `reason`), with the label shown to the user.
enum ReportReason {
  spam('spam'),
  abusive('abusive'),
  inappropriate('inappropriate'),
  inaccurate('inaccurate'),
  privacy('privacy'),
  other('other');

  const ReportReason(this.json);

  final String json;

  /// Label in the current language.
  String get label => labelIn(L10n.current);

  /// Label in [l].
  String labelIn(AppLocalizations l) => switch (this) {
    spam => l.reportReasonSpam,
    abusive => l.reportReasonAbusive,
    inappropriate => l.reportReasonInappropriate,
    inaccurate => l.reportReasonInaccurate,
    privacy => l.reportReasonPrivacy,
    other => l.reportReasonOther,
  };

  /// Reasons offered for a chat message.
  static const forMessage = [spam, abusive, inappropriate, privacy, other];

  /// Reasons offered for an AI result (screening summary, document reading).
  static const forAiResult = [inaccurate, inappropriate, other];

  static List<ReportReason> forTarget(ReportTargetType type) =>
      type == ReportTargetType.message ? forMessage : forAiResult;
}

/// Content reports (CG-16): users flag a chat message or an AI result for the moderation team.
class ReportRepository {
  ReportRepository(this._api);

  final ApiClient _api;

  /// Longest note the API accepts.
  static const maxNoteLength = 1000;

  /// `POST /reports {target_type, target_id, reason, note?}` -> 201. Re-reporting the same target while
  /// the earlier report is still open returns that report, so a double tap is harmless.
  Future<void> report({
    required ReportTargetType type,
    required String targetId,
    required ReportReason reason,
    String? note,
  }) async {
    final trimmed = note?.trim();
    await _api.post(
      '/reports',
      data: compactJson({
        'target_type': type.json,
        'target_id': targetId,
        'reason': reason.json,
        'note': trimmed == null || trimmed.isEmpty
            ? null
            : (trimmed.length > maxNoteLength ? trimmed.substring(0, maxNoteLength) : trimmed),
      }),
    );
  }
}

final reportRepositoryProvider = Provider<ReportRepository>((ref) => ReportRepository(ref.watch(apiClientProvider)));
