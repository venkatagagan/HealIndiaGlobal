import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/aftercare_repository.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../widgets/checkin_tile.dart';
import 'checkin_form_screen.dart';

/// Opens a video call link in the browser / Jitsi app. Overridden in widget tests.
final meetingLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (ref) =>
      (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

/// Aftercare after discharge: follow-up video calls (join / request another) and recovery check-ins.
/// Patients see their own treated cases; agents see their patients'.
///
/// Route: `/aftercare` (patient) · `/agent/aftercare` (agent).
class AftercareScreen extends ConsumerWidget {
  const AftercareScreen({super.key, this.forAgent = false});

  final bool forAgent;

  Future<void> _join(BuildContext context, WidgetRef ref, String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null || !(uri.scheme == 'https' || uri.scheme == 'http')) return;
    final ok = await ref.read(meetingLauncherProvider)(uri);
    if (!ok && context.mounted) showInfoSnack(context, context.l10n.aftercareCouldNotOpen);
  }

  Future<void> _requestFollowup(BuildContext context, WidgetRef ref, AftercareCase c) async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _FollowupRequestSheet(aftercareCase: c),
    );
    if (sent == true) ref.invalidate(aftercareProvider);
  }

  Future<void> _answer(BuildContext context, WidgetRef ref, AftercareCheckin c) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CheckinFormScreen(checkin: c)));
    ref.invalidate(aftercareProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(aftercareProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.aftercareTitle)),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(aftercareProvider.future),
        child: AsyncValueView<Aftercare>(
          value: value,
          onRetry: () => ref.invalidate(aftercareProvider),
          data: (a) => a.isEmpty
              ? ListView(
                  children: [
                    EmptyView(
                      icon: Icons.healing_outlined,
                      title: l10n.aftercareEmptyTitle,
                      message: l10n.aftercareEmptyMessage,
                    ),
                  ],
                )
              : ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                  children: [
                    if (a.checkinsDue.isNotEmpty) ...[
                      SectionTitle(l10n.aftercareDueTitle, subtitle: l10n.aftercareDueHint),
                      for (final c in a.checkinsDue)
                        CheckinSummaryTile(checkin: c, onAnswer: () => _answer(context, ref, c)),
                    ],
                    SectionTitle(l10n.aftercareFollowupsTitle),
                    if (a.followups.isEmpty)
                      Text(l10n.aftercareNoFollowups, style: context.text.bodyMedium)
                    else
                      for (final f in a.followups)
                        _FollowupCard(followup: f, onJoin: (url) => _join(context, ref, url)),
                    for (final c in a.cases)
                      AppCard(
                        key: ValueKey('aftercare-case-${c.caseId}'),
                        margin: const EdgeInsets.only(top: 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(c.hospital.name, style: context.text.titleSmall),
                            Text(
                              [
                                c.caseNumber,
                                c.doctor?.fullName,
                                if (c.dischargedOn != null) l10n.aftercareDischarged(Dates.day(c.dischargedOn)),
                              ].whereType<String>().join(' · '),
                              style: context.text.bodySmall,
                            ),
                            if (c.aftercareUntil != null)
                              Text(
                                l10n.aftercareUntil(Dates.day(c.aftercareUntil)),
                                style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
                              ),
                            const SizedBox(height: 10),
                            SecondaryButton(
                              key: ValueKey('aftercare-request-${c.caseId}'),
                              label: l10n.aftercareRequestFollowup,
                              icon: Icons.video_call_outlined,
                              onPressed: c.canRequestFollowup ? () => _requestFollowup(context, ref, c) : null,
                            ),
                          ],
                        ),
                      ),
                    if (a.upcomingCheckins.isNotEmpty) ...[
                      SectionTitle(l10n.aftercareUpcomingTitle),
                      for (final c in a.upcomingCheckins)
                        AppCard(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          child: Row(
                            children: [
                              const Icon(Icons.event_note_outlined, color: AppColors.violet),
                              const SizedBox(width: 10),
                              Expanded(child: Text(l10n.aftercareCheckinDay(c.day), style: context.text.bodyMedium)),
                              Text(Dates.day(c.dueAt), style: context.text.labelMedium),
                            ],
                          ),
                        ),
                    ],
                  ],
                ),
        ),
      ),
    );
  }
}

class _FollowupCard extends StatelessWidget {
  const _FollowupCard({required this.followup, required this.onJoin});

  final Consultation followup;
  final ValueChanged<String> onJoin;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final f = followup;
    final scheduled = f.scheduledAt != null;
    final url = f.meetingUrl;
    return AppCard(
      key: ValueKey('followup-${f.id}'),
      margin: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.videocam_outlined, color: AppColors.info),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  f.followupDay == null ? l10n.aftercareFollowup : l10n.aftercareFollowupDay(f.followupDay!),
                  style: context.text.titleSmall,
                ),
              ),
              StatusBadge.forEnum(f.status, dense: true),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            scheduled
                ? Dates.dayTime(f.scheduledAt)
                : (f.dueAt == null ? l10n.aftercareTimeToConfirm : l10n.aftercareAround(Dates.day(f.dueAt))),
            style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
          if ((f.doctorName ?? f.hospitalName) != null)
            Text([f.doctorName, f.hospitalName].whereType<String>().join(' · '), style: context.text.bodySmall),
          if (url != null && url.isNotEmpty) ...[
            const SizedBox(height: 10),
            PrimaryButton(
              key: ValueKey('followup-join-${f.id}'),
              label: l10n.aftercareJoinCall,
              icon: Icons.video_call_rounded,
              onPressed: () => onJoin(url),
            ),
          ] else if (!scheduled)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(l10n.aftercareLinkLater, style: context.text.labelSmall),
            ),
        ],
      ),
    );
  }
}

/// `POST /consultations {case_id, kind: followup, preferred_at?, notes?}`.
class _FollowupRequestSheet extends ConsumerStatefulWidget {
  const _FollowupRequestSheet({required this.aftercareCase});

  final AftercareCase aftercareCase;

  @override
  ConsumerState<_FollowupRequestSheet> createState() => _FollowupRequestSheetState();
}

class _FollowupRequestSheetState extends ConsumerState<_FollowupRequestSheet> {
  final _notes = TextEditingController();
  DateTime? _preferred;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final now = DateTime.now();
    final day = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: widget.aftercareCase.aftercareUntil ?? now.add(const Duration(days: 365)),
    );
    if (day == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 10, minute: 0));
    if (!mounted) return;
    setState(() => _preferred = DateTime(day.year, day.month, day.day, time?.hour ?? 10, time?.minute ?? 0));
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(caseRepositoryProvider)
          .requestConsultation(
            caseId: widget.aftercareCase.caseId,
            doctorId: widget.aftercareCase.doctor?.id,
            kind: 'followup',
            preferredAt: _preferred,
            notes: _notes.text.trim(),
          );
      if (!mounted) return;
      showInfoSnack(context, context.l10n.aftercareFollowupRequested);
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsetsDirectional.fromSTEB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.aftercareRequestFollowup, style: context.text.titleLarge),
          const SizedBox(height: 4),
          Text(widget.aftercareCase.hospital.name, style: context.text.bodySmall),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            icon: const Icon(Icons.schedule_rounded),
            label: Text(_preferred == null ? l10n.aftercarePreferredTime : Dates.dayTime(_preferred)),
            onPressed: _pick,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            minLines: 2,
            maxLines: 5,
            maxLength: 2000,
            decoration: InputDecoration(labelText: l10n.aftercareFollowupNotes, alignLabelWithHint: true),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
            ),
          PrimaryButton(
            key: const ValueKey('followup-send'),
            label: l10n.aftercareSendRequest,
            loading: _busy,
            onPressed: _send,
          ),
        ],
      ),
    );
  }
}
