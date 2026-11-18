import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../trips/services/file_actions.dart';
import '../data/hospital_models.dart';
import '../data/hospital_repository.dart';

/// Localized label of a field the invitation letter could not fill in (`missing[]`).
String missingFieldLabel(AppLocalizations l10n, String code) => switch (code) {
  'passport_number' => l10n.inviteMissingPassport,
  'date_of_birth' => l10n.inviteMissingDob,
  'nationality' => l10n.inviteMissingNationality,
  'treating_doctor' || 'doctor' => l10n.inviteMissingDoctor,
  'estimated_arrival_date' || 'arrival_date' => l10n.inviteMissingArrival,
  'estimated_duration_days' || 'duration' => l10n.inviteMissingDuration,
  'procedure' || 'treatment' => l10n.inviteMissingTreatment,
  _ => code.replaceAll('_', ' '),
};

/// Hospital: generate the invitation letter for a visa request (optional details, shows `missing[]`),
/// preview / download the draft and approve it so the patient receives it. Pops with true when approved.
class InvitationLetterSheet extends ConsumerStatefulWidget {
  const InvitationLetterSheet({super.key, required this.visa});

  final HospitalVisaRequest visa;

  @override
  ConsumerState<InvitationLetterSheet> createState() => _InvitationLetterSheetState();
}

class _Attendant {
  final name = TextEditingController();
  final relationship = TextEditingController();
  final passport = TextEditingController();

  void dispose() {
    name.dispose();
    relationship.dispose();
    passport.dispose();
  }
}

class _InvitationLetterSheetState extends ConsumerState<InvitationLetterSheet> {
  final _duration = TextEditingController();
  final _contactName = TextEditingController();
  final _contactPhone = TextEditingController();
  final _contactEmail = TextEditingController();
  final _notes = TextEditingController();
  final List<_Attendant> _attendants = [];
  DateTime? _arrival;
  InvitationLetterResult? _result;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_duration, _contactName, _contactPhone, _contactEmail, _notes]) {
      c.dispose();
    }
    for (final a in _attendants) {
      a.dispose();
    }
    super.dispose();
  }

  String? get _draftId => _result?.draftDocumentId ?? widget.visa.invitationLetterDraftDocumentId;

  Future<void> _generate() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref
          .read(hospitalRepositoryProvider)
          .generateInvitationLetter(
            widget.visa.id,
            InvitationLetterDraft(
              estimatedArrivalDate: _arrival,
              estimatedDurationDays: int.tryParse(_duration.text.trim()),
              attendants: [
                for (final a in _attendants)
                  if (a.name.text.trim().isNotEmpty)
                    (
                      fullName: a.name.text.trim(),
                      relationship: a.relationship.text.trim(),
                      passportNumber: a.passport.text.trim(),
                    ),
              ],
              contactName: _contactName.text.trim(),
              contactPhone: _contactPhone.text.trim(),
              contactEmail: _contactEmail.text.trim(),
              notes: _notes.text.trim(),
            ),
          );
      if (mounted) setState(() => _result = r);
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _preview() async {
    final id = _draftId;
    if (id == null) return;
    final repo = ref.read(documentRepositoryProvider);
    try {
      final doc = await repo.get(id);
      if (mounted) await openDocument(context, repo, doc);
    } on Object catch (e) {
      if (mounted) showErrorSnack(context, e);
    }
  }

  Future<void> _approve() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(hospitalRepositoryProvider).approveInvitationLetter(widget.visa.id);
      ref.invalidate(hospitalVisasProvider);
      if (!mounted) return;
      showInfoSnack(context, context.l10n.inviteApproved);
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
    final missing = _result?.missing ?? const <String>[];
    return Padding(
      padding: EdgeInsetsDirectional.fromSTEB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.inviteTitle, style: context.text.titleLarge),
            Text(
              [widget.visa.patientName, widget.visa.caseNumber].whereType<String>().join(' · '),
              style: context.text.bodySmall,
            ),
            const SizedBox(height: 8),
            Text(l10n.inviteIntro, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              icon: const Icon(Icons.flight_land_rounded),
              label: Text(_arrival == null ? l10n.inviteArrival : l10n.inviteArrivalValue(Dates.day(_arrival))),
              onPressed: () async {
                final now = DateTime.now();
                final d = await showDatePicker(
                  context: context,
                  initialDate: _arrival ?? now.add(const Duration(days: 14)),
                  firstDate: now,
                  lastDate: now.add(const Duration(days: 365)),
                );
                if (d != null) setState(() => _arrival = d);
              },
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _duration,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(labelText: l10n.inviteDuration),
            ),
            for (final a in _attendants) ...[
              const SizedBox(height: 8),
              Text(l10n.inviteAttendant, style: context.text.titleSmall),
              TextField(
                controller: a.name,
                decoration: InputDecoration(labelText: l10n.inviteAttendantName),
              ),
              TextField(
                controller: a.relationship,
                decoration: InputDecoration(labelText: l10n.inviteAttendantRelationship),
              ),
              TextField(
                controller: a.passport,
                decoration: InputDecoration(labelText: l10n.inviteAttendantPassport),
              ),
            ],
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                icon: const Icon(Icons.person_add_alt_1_outlined),
                label: Text(l10n.inviteAddAttendant),
                onPressed: _attendants.length >= 4 ? null : () => setState(() => _attendants.add(_Attendant())),
              ),
            ),
            TextField(
              controller: _contactName,
              decoration: InputDecoration(labelText: l10n.inviteContactName),
            ),
            TextField(
              controller: _contactPhone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(labelText: l10n.inviteContactPhone),
            ),
            TextField(
              controller: _contactEmail,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(labelText: l10n.inviteContactEmail),
            ),
            TextField(
              controller: _notes,
              maxLines: 2,
              decoration: InputDecoration(labelText: l10n.hpNotesLabel),
            ),
            const SizedBox(height: 12),
            if (missing.isNotEmpty)
              AppCard(
                key: const ValueKey('invite-missing'),
                color: AppColors.warning.withValues(alpha: 0.12),
                borderColor: AppColors.warning.withValues(alpha: 0.4),
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l10n.inviteMissingTitle, style: context.text.titleSmall),
                    for (final m in missing) Text('• ${missingFieldLabel(l10n, m)}', style: context.text.bodySmall),
                  ],
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
              ),
            const SizedBox(height: 8),
            SecondaryButton(
              key: const ValueKey('invite-generate'),
              label: _draftId == null ? l10n.inviteGenerate : l10n.inviteRegenerate,
              icon: Icons.description_outlined,
              loading: _busy && _result == null,
              onPressed: _busy ? null : _generate,
            ),
            if (_draftId != null) ...[
              const SizedBox(height: 8),
              SecondaryButton(
                key: const ValueKey('invite-preview'),
                label: l10n.invitePreview,
                icon: Icons.visibility_outlined,
                onPressed: _preview,
              ),
              const SizedBox(height: 8),
              PrimaryButton(
                key: const ValueKey('invite-approve'),
                label: l10n.inviteApprove,
                icon: Icons.send_rounded,
                loading: _busy && _result != null,
                onPressed: _busy ? null : _approve,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
