import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/auth/auth_repository.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// Opens the "Request quote" flow for a hospital (optionally a doctor). Guests and signed-out users
/// are sent to registration first (cases need a full account).
Future<void> requestQuote(
  BuildContext context,
  WidgetRef ref, {
  required String hospitalId,
  required String hospitalName,
  String? doctorId,
  String? doctorName,
  String? specialtyId,
  List<HospitalProcedure> procedures = const [],
}) async {
  final auth = ref.read(authStateProvider);
  if (!auth.isAuthenticated) {
    String here;
    try {
      here = GoRouterState.of(context).uri.toString();
    } on Object {
      here = Routes.home;
    }
    await context.push(Routes.registerFrom(here));
    return;
  }
  final caseId = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => RequestQuoteSheet(
      hospitalId: hospitalId,
      hospitalName: hospitalName,
      doctorId: doctorId,
      doctorName: doctorName,
      specialtyId: specialtyId,
      procedures: procedures,
    ),
  );
  if (caseId != null && context.mounted) {
    showInfoSnack(context, context.l10n.quoteRequestedSnack);
    await context.push(Routes.caseDetail(caseId));
  }
}

/// Bottom sheet: optional procedure, notes and explicit consent to share with this hospital, then
/// `POST /cases` (status `enquiry`). Pops with the new case id.
class RequestQuoteSheet extends ConsumerStatefulWidget {
  const RequestQuoteSheet({
    super.key,
    required this.hospitalId,
    required this.hospitalName,
    this.doctorId,
    this.doctorName,
    this.specialtyId,
    this.procedures = const [],
  });

  final String hospitalId;
  final String hospitalName;
  final String? doctorId;
  final String? doctorName;
  final String? specialtyId;
  final List<HospitalProcedure> procedures;

  @override
  ConsumerState<RequestQuoteSheet> createState() => _RequestQuoteSheetState();
}

class _RequestQuoteSheetState extends ConsumerState<RequestQuoteSheet> {
  final _notes = TextEditingController();
  String? _procedureId;
  bool _consent = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_consent || _loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).recordConsent(kind: ConsentKind.shareWithHospitals, granted: true);
      final created = await ref
          .read(caseRepositoryProvider)
          .create(
            hospitalId: widget.hospitalId,
            doctorId: widget.doctorId,
            procedureId: _procedureId,
            specialtyId: widget.specialtyId,
            patientNotes: _notes.text.trim(),
          );
      ref.invalidate(casesProvider);
      if (mounted) Navigator.of(context).pop(created.id);
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(l10n.quoteSheetTitle, style: context.text.titleLarge),
            const SizedBox(height: 4),
            Text(
              widget.doctorName == null ? widget.hospitalName : '${widget.doctorName} · ${widget.hospitalName}',
              style: context.text.bodySmall,
            ),
            const SizedBox(height: 16),
            if (widget.procedures.isNotEmpty) ...[
              DropdownButtonFormField<String?>(
                initialValue: _procedureId,
                isExpanded: true,
                decoration: InputDecoration(labelText: l10n.quoteTreatmentLabel),
                items: [
                  DropdownMenuItem<String?>(value: null, child: Text(l10n.quoteTreatmentNotSure)),
                  for (final p in widget.procedures)
                    DropdownMenuItem<String?>(value: p.procedure.id, child: Text(p.procedure.name)),
                ],
                onChanged: (v) => setState(() => _procedureId = v),
              ),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: _notes,
              minLines: 3,
              maxLines: 6,
              maxLength: 2000,
              decoration: InputDecoration(
                labelText: l10n.quoteNotesLabel,
                hintText: l10n.quoteNotesHint,
                alignLabelWithHint: true,
              ),
            ),
            CheckboxListTile(
              value: _consent,
              onChanged: (v) => setState(() => _consent = v ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.quoteConsent(widget.hospitalName), style: context.text.bodySmall),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
              ),
            const SizedBox(height: 8),
            PrimaryButton(
              label: l10n.quoteSendRequest,
              icon: Icons.send_rounded,
              loading: _loading,
              onPressed: _consent ? _submit : null,
            ),
          ],
        ),
      ),
    );
  }
}
