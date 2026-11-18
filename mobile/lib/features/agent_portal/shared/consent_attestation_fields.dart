import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../data/crm_models.dart';

/// Label of a consent method.
String consentMethodLabel(AppLocalizations l10n, AgentConsentMethod m) => switch (m) {
  AgentConsentMethod.inPerson => l10n.crmConsentMethodInPerson,
  AgentConsentMethod.phone => l10n.crmConsentMethodPhone,
  AgentConsentMethod.videoCall => l10n.crmConsentMethodVideoCall,
  AgentConsentMethod.written => l10n.crmConsentMethodWritten,
  AgentConsentMethod.email => l10n.crmConsentMethodEmail,
};

/// "Patient consent" block of the add-patient / convert-lead form: the agent attests that the patient
/// agreed to the terms and privacy policy (required), optionally to sharing records with hospitals, and how
/// consent was obtained. The patient confirms it on first sign-in.
class ConsentAttestationFields extends StatelessWidget {
  const ConsentAttestationFields({
    super.key,
    required this.attested,
    required this.onAttestedChanged,
    required this.value,
    required this.onChanged,
    required this.noteController,
    this.showError = false,
  });

  final bool attested;
  final ValueChanged<bool> onAttestedChanged;
  final AgentConsentAttestation value;
  final ValueChanged<AgentConsentAttestation> onChanged;
  final TextEditingController noteController;

  /// Shows the "confirm consent" error under the attestation checkbox.
  final bool showError;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(l10n.crmConsentSection),
        CheckboxListTile(
          key: const ValueKey('consent-attest'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: attested,
          onChanged: (v) => onAttestedChanged(v ?? false),
          title: Text(l10n.crmConsentAttest),
          subtitle: Text(
            showError && !attested ? l10n.crmConsentRequired : l10n.crmConsentAttestHint,
            style: context.text.bodySmall?.copyWith(
              color: showError && !attested ? AppColors.danger : context.palette.textSecondary,
            ),
          ),
        ),
        CheckboxListTile(
          key: const ValueKey('consent-share'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: value.shareWithHospitals,
          onChanged: (v) => onChanged(
            AgentConsentAttestation(method: value.method, shareWithHospitals: v ?? false, note: value.note),
          ),
          title: Text(l10n.crmConsentShare),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<AgentConsentMethod>(
          key: const ValueKey('consent-method'),
          initialValue: value.method,
          isExpanded: true,
          decoration: InputDecoration(labelText: l10n.crmConsentMethod),
          items: [
            for (final m in AgentConsentMethod.values)
              DropdownMenuItem(value: m, child: Text(consentMethodLabel(l10n, m))),
          ],
          onChanged: (m) => onChanged(
            AgentConsentAttestation(
              method: m ?? AgentConsentMethod.inPerson,
              shareWithHospitals: value.shareWithHospitals,
              note: value.note,
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: noteController,
          maxLength: 500,
          decoration: InputDecoration(
            labelText: l10n.crmConsentNote,
            hintText: l10n.crmConsentNoteHint,
            counterText: '',
          ),
        ),
      ],
    );
  }
}
