import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/l10n.dart';
import '../models/guardian.dart';
import '../network/api_exception.dart';
import '../repositories/privacy_repository.dart';
import '../theme/app_theme.dart';
import '../utils/dates.dart';
import 'buttons.dart';

/// When [error] is a 403 `guardian_consent_required`, explains why and opens the guardian consent form;
/// returns true when it handled the error (callers then skip their own error message).
Future<bool> handleGuardianConsentError(BuildContext context, Object? error) async {
  if (error == null || !ApiException.from(error).isGuardianConsentRequired) return false;
  await showGuardianConsentSheet(context);
  return true;
}

/// Guardian consent for a patient under 18 (`POST /privacy/guardian-consent`). Pops with true when sent.
Future<bool?> showGuardianConsentSheet(BuildContext context, {String? patientId}) => showModalBottomSheet<bool>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => GuardianConsentSheet(patientId: patientId),
);

class GuardianConsentSheet extends ConsumerStatefulWidget {
  const GuardianConsentSheet({super.key, this.patientId});

  /// Agents name the patient; a patient's own account leaves it null.
  final String? patientId;

  @override
  ConsumerState<GuardianConsentSheet> createState() => _GuardianConsentSheetState();
}

class _GuardianConsentSheetState extends ConsumerState<GuardianConsentSheet> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  String _relationship = 'parent';
  String _method = 'video_call';
  DateTime? _dob;
  bool _declaration = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 40, now.month, now.day),
      firstDate: DateTime(now.year - 110),
      lastDate: DateTime(now.year - 18, now.month, now.day),
    );
    if (picked != null) setState(() => _dob = picked);
  }

  Future<void> _submit() async {
    final l10n = context.l10n;
    if (!(_form.currentState?.validate() ?? false)) return;
    if (_dob == null) {
      setState(() => _error = l10n.guardianDobRequired);
      return;
    }
    if (_email.text.trim().isEmpty && _phone.text.trim().isEmpty) {
      setState(() => _error = l10n.guardianContactRequired);
      return;
    }
    if (!_declaration) {
      setState(() => _error = l10n.guardianDeclarationRequired);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(privacyRepositoryProvider).recordGuardianConsent(
        GuardianConsentRequest(
          patientId: widget.patientId,
          guardianName: _name.text.trim(),
          relationship: _relationship,
          guardianEmail: _email.text.trim(),
          guardianPhone: _phone.text.trim(),
          guardianDateOfBirth: _dob!,
          verificationMethod: _method,
        ),
      );
      ref.invalidate(guardianStatusProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.guardianSent)));
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
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsetsDirectional.fromSTEB(16, 0, 16, 16 + bottom),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(Icons.family_restroom_rounded, color: AppColors.violet),
                  const SizedBox(width: 10),
                  Expanded(child: Text(l10n.guardianTitle, style: context.text.titleLarge)),
                ],
              ),
              const SizedBox(height: 8),
              Text(l10n.guardianIntro, style: context.text.bodyMedium),
              const SizedBox(height: 16),
              TextFormField(
                key: const ValueKey('guardian-name'),
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: InputDecoration(labelText: l10n.guardianName),
                validator: (v) => (v ?? '').trim().length < 2 ? l10n.guardianNameRequired : null,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _relationship,
                isExpanded: true,
                decoration: InputDecoration(labelText: l10n.guardianRelationship),
                items: [
                  DropdownMenuItem(value: 'parent', child: Text(l10n.guardianRelationshipParent)),
                  DropdownMenuItem(value: 'lawful_guardian', child: Text(l10n.guardianRelationshipLawful)),
                ],
                onChanged: (v) => setState(() => _relationship = v ?? 'parent'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                key: const ValueKey('guardian-email'),
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(labelText: l10n.guardianEmail),
                validator: (v) {
                  final t = (v ?? '').trim();
                  return t.isEmpty || RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(t) ? null : l10n.guardianEmailInvalid;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                key: const ValueKey('guardian-phone'),
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(labelText: l10n.guardianPhone, hintText: '+234 803 123 4567'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                key: const ValueKey('guardian-dob'),
                style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                icon: const Icon(Icons.cake_outlined),
                label: Text(_dob == null ? l10n.guardianDob : l10n.guardianDobValue(Dates.day(_dob))),
                onPressed: _pickDob,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _method,
                isExpanded: true,
                decoration: InputDecoration(labelText: l10n.guardianVerification),
                items: [
                  DropdownMenuItem(value: 'video_call', child: Text(l10n.guardianVerifyVideo)),
                  DropdownMenuItem(value: 'id_document', child: Text(l10n.guardianVerifyId)),
                  DropdownMenuItem(value: 'digilocker', child: Text(l10n.guardianVerifyDigilocker)),
                  DropdownMenuItem(value: 'in_person', child: Text(l10n.guardianVerifyInPerson)),
                ],
                onChanged: (v) => setState(() => _method = v ?? 'video_call'),
              ),
              CheckboxListTile(
                key: const ValueKey('guardian-declaration'),
                value: _declaration,
                onChanged: (v) => setState(() => _declaration = v ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                title: Text(l10n.guardianDeclaration, style: context.text.bodySmall),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
                ),
              PrimaryButton(
                key: const ValueKey('guardian-submit'),
                label: l10n.guardianSubmit,
                icon: Icons.send_rounded,
                loading: _busy,
                onPressed: _submit,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.guardianAfterSubmit,
                style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
