import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_repository.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../screening/providers/emergency_ack.dart';

/// "Book Consultation": asks for consent to share the screening with the hospital, creates a case
/// (`POST /cases`, status `enquiry`) and opens the booking route (`/book/:caseId`, owned by fl-journey).
///
/// When the screening's urgency is `emergency`, the patient must first acknowledge the emergency
/// guidance (INTEGRATION_BACKLOG #13); otherwise nothing is created.
///
/// Returns the created case, or null when cancelled.
Future<MedicalCase?> requestConsultation(
  BuildContext context, {
  required ScreeningMatch match,
  String? screeningId,
  String? specialtyId,
}) async {
  var gate = EmergencyGate.clear;
  if (screeningId != null) {
    gate = await ensureEmergencyAcknowledged(context, screeningId: screeningId);
    if (!gate.allowed || !context.mounted) return null;
  }
  final created = await showModalBottomSheet<MedicalCase>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => ConsultationRequestSheet(
      match: match,
      screeningId: screeningId,
      specialtyId: specialtyId,
      emergencyAcknowledged: gate == EmergencyGate.acknowledged,
    ),
  );
  if (created != null && context.mounted) {
    showInfoSnack(context, context.l10n.consultationRequestSentSnack(created.caseNumber, match.hospital.name));
    await context.push(Routes.book(created.id, packageId: match.package?.id));
  }
  return created;
}

/// Bottom sheet with notes + consent checkbox that creates the case.
class ConsultationRequestSheet extends ConsumerStatefulWidget {
  const ConsultationRequestSheet({
    super.key,
    required this.match,
    this.screeningId,
    this.specialtyId,
    this.emergencyAcknowledged = false,
  });

  final ScreeningMatch match;
  final String? screeningId;
  final String? specialtyId;

  /// The patient acknowledged the screening's emergency guidance: the new case is acknowledged
  /// server-side right after creation (`POST /cases/{id}/emergency-ack`).
  final bool emergencyAcknowledged;

  @override
  ConsumerState<ConsultationRequestSheet> createState() => _ConsultationRequestSheetState();
}

class _ConsultationRequestSheetState extends ConsumerState<ConsultationRequestSheet> {
  final _notes = TextEditingController();
  bool _consent = false;
  bool _busy = false;
  String? _error;
  bool _guestUpgrade = false;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_consent) {
      setState(() => _error = context.l10n.consultationConsentRequired);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final m = widget.match;
    try {
      // Records `share_with_hospitals` consent (PLAN §9.9) before the case is created.
      try {
        await ref.read(authRepositoryProvider).recordConsent(kind: ConsentKind.shareWithHospitals, granted: true);
      } on ApiException catch (e) {
        if (e.isNetwork) rethrow;
        // Older servers without the consents endpoint: the case endpoint reports `consent_required`.
      }
      final created = await ref
          .read(caseRepositoryProvider)
          .create(
            hospitalId: m.hospital.id,
            doctorId: m.doctor?.id,
            procedureId: m.procedure?.id,
            specialtyId: widget.specialtyId ?? m.doctor?.specialty?.id,
            screeningId: widget.screeningId,
            patientNotes: _notes.text.trim(),
          );
      if (widget.emergencyAcknowledged) {
        try {
          await ref.read(caseEmergencyApiProvider).acknowledge(created.id);
        } catch (_) {
          // Booking answers 409 `emergency_ack_required` and asks again (handleEmergencyAckRequired).
        }
      }
      ref.invalidate(casesProvider);
      if (mounted) Navigator.of(context).pop(created);
    } catch (e) {
      if (mounted) {
        setState(() {
          _guestUpgrade = isGuestUpgradeRequired(e);
          _error = _guestUpgrade ? context.l10n.consultationGuestUpgrade : errorMessage(e);
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.match;
    final who = m.doctor?.fullName ?? m.hospital.name;
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l10n.consultationBookTitle, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(
                '$who · ${m.hospital.name}${m.hospital.city == null ? '' : ', ${m.hospital.city}'}',
                style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
              ),
              if (m.procedure != null) ...[
                const SizedBox(height: 4),
                Text(m.procedure!.name, style: context.text.bodyMedium),
              ],
              const SizedBox(height: 16),
              TextField(
                controller: _notes,
                maxLines: 3,
                maxLength: 2000,
                decoration: InputDecoration(
                  labelText: l10n.consultationMessageLabel,
                  hintText: l10n.consultationMessageHint,
                  alignLabelWithHint: true,
                ),
              ),
              CheckboxListTile(
                value: _consent,
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                activeColor: AppColors.primary,
                onChanged: _busy ? null : (v) => setState(() => _consent = v ?? false),
                title: Text(l10n.consultationConsent(m.hospital.name), style: context.text.bodySmall),
              ),
              if (_error != null) ...[
                const SizedBox(height: 4),
                Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
              ],
              const SizedBox(height: 12),
              if (_guestUpgrade)
                PrimaryButton(
                  label: l10n.consultationCreateAccount,
                  onPressed: () {
                    final router = GoRouter.of(context);
                    final here = router.routeInformationProvider.value.uri.toString();
                    Navigator.of(context).pop();
                    router.go(Routes.registerFrom(here));
                  },
                )
              else
                PrimaryButton(label: l10n.quoteSendRequest, loading: _busy, onPressed: _submit),
              const SizedBox(height: 8),
              Text(
                l10n.consultationPayAfterAccept,
                textAlign: TextAlign.center,
                style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
