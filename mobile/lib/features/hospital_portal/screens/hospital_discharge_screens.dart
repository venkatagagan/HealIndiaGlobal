import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/discharge_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../agent_portal/shared/portal_widgets.dart';
import '../../discharge/screens/discharge_screens.dart';
import '../../discharge/widgets/discharge_view.dart';
import '../data/hospital_repository.dart';
import '../hospital_routes.dart';

final _codeRe = RegExp(r'^[A-Za-z0-9.\-]{1,20}$');

/// Opens the summary named by a 409 `discharge_draft_exists` (details.discharge_summary_id), if any.
String? _existingDraftId(ApiException e) {
  final d = e.details;
  final id = d is Map ? d['discharge_summary_id'] : null;
  return e.code == 'discharge_draft_exists' && id != null ? id.toString() : null;
}

// ------------------------------------------------------------------------------------------- list

/// Discharge summaries of the hospital (drafts and finals), or of one case with "Start discharge summary"
/// (prefilled from the case, booking, doctor and the patient's allergies).
///
/// Route: `/hospital/discharge-summaries?case=&booking=`.
class HospitalDischargeListScreen extends ConsumerStatefulWidget {
  const HospitalDischargeListScreen({super.key, this.caseId, this.bookingId});

  final String? caseId;
  final String? bookingId;

  @override
  ConsumerState<HospitalDischargeListScreen> createState() => _HospitalDischargeListScreenState();
}

class _HospitalDischargeListScreenState extends ConsumerState<HospitalDischargeListScreen> {
  bool _busy = false;

  DischargeQuery get _query => (caseId: widget.caseId, bookingId: null);

  Future<void> _start() async {
    final caseId = widget.caseId;
    if (caseId == null) return;
    setState(() => _busy = true);
    final repo = ref.read(dischargeRepositoryProvider);
    try {
      final prefill = await repo.prefill(caseId: caseId, bookingId: widget.bookingId);
      final created = await repo.create(prefill.toCreateJson());
      ref.invalidate(dischargeSummariesProvider);
      if (mounted) await context.push(HospitalRoutes.dischargeSummary(created.id));
    } catch (e) {
      if (!mounted) return;
      final api = ApiException.from(e);
      final existing = _existingDraftId(api);
      if (existing != null) {
        showInfoSnack(context, context.l10n.dischargeHpDraftExists);
        await context.push(HospitalRoutes.dischargeSummary(existing));
      } else if (api.code == 'discharge_summary_exists') {
        showInfoSnack(context, context.l10n.dischargeHpFinalExists);
      } else {
        showErrorSnack(context, e);
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        ref.invalidate(dischargeSummariesProvider(_query));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final value = ref.watch(dischargeSummariesProvider(_query));
    final items = value.value;
    final canStart = widget.caseId != null && items != null && items.isEmpty;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.dischargeListTitle)),
      bottomNavigationBar: !canStart
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: PrimaryButton(
                  key: const ValueKey('discharge-hp-start'),
                  label: l10n.dischargeHpStart,
                  icon: Icons.note_add_outlined,
                  loading: _busy,
                  onPressed: _start,
                ),
              ),
            ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(dischargeSummariesProvider(_query).future),
        child: AsyncValueView<List<DischargeSummaryListItem>>(
          value: value,
          onRetry: () => ref.invalidate(dischargeSummariesProvider(_query)),
          data: (items) => items.isEmpty
              ? ListView(
                  children: [
                    EmptyView(
                      icon: Icons.summarize_outlined,
                      title: widget.caseId == null ? l10n.dischargeHpEmptyAll : l10n.dischargeHpEmpty,
                    ),
                  ],
                )
              : ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: AppSpacing.pageAll,
                  children: [
                    for (final item in items)
                      DischargeListTile(
                        item: item,
                        showPatient: true,
                        onTap: () async {
                          await context.push(HospitalRoutes.dischargeSummary(item.id));
                          ref.invalidate(dischargeSummariesProvider(_query));
                        },
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

// ----------------------------------------------------------------------------------------- editor

/// One discharge summary for the hospital: a draft is edited (save, finalize, discard); a final version is
/// read-only (PDF / FHIR) and "Edit as new version" starts the next draft.
///
/// Route: `/hospital/discharge-summaries/:id`.
class HospitalDischargeEditorScreen extends ConsumerWidget {
  const HospitalDischargeEditorScreen({super.key, required this.summaryId});

  final String summaryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final value = ref.watch(dischargeSummaryProvider(summaryId));
    final s = value.value;
    return Scaffold(
      appBar: AppBar(title: Text(s?.isDraft ?? false ? l10n.dischargeHpEditorTitle : l10n.dischargeTitle)),
      body: AsyncValueView<DischargeSummary>(
        value: value,
        onRetry: () => ref.invalidate(dischargeSummaryProvider(summaryId)),
        data: (s) => s.isDraft ? _DraftEditor(key: ValueKey('draft-${s.id}'), summary: s) : _FinalView(summary: s),
      ),
    );
  }
}

class _FinalView extends ConsumerStatefulWidget {
  const _FinalView({required this.summary});

  final DischargeSummary summary;

  @override
  ConsumerState<_FinalView> createState() => _FinalViewState();
}

class _FinalViewState extends ConsumerState<_FinalView> {
  bool _busy = false;

  Future<void> _newVersion() async {
    final l10n = context.l10n;
    final s = widget.summary;
    final ok = await confirmAction(
      context,
      title: l10n.dischargeHpNewVersionTitle,
      message: l10n.dischargeHpNewVersionBody(s.version, s.version + 1),
      confirmLabel: l10n.dischargeHpNewVersion,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final draft = await ref.read(dischargeRepositoryProvider).newVersion(s.id);
      ref.invalidate(dischargeSummariesProvider);
      if (mounted) context.pushReplacement(HospitalRoutes.dischargeSummary(draft.id));
    } catch (e) {
      if (!mounted) return;
      final existing = _existingDraftId(ApiException.from(e));
      if (existing != null) {
        context.pushReplacement(HospitalRoutes.dischargeSummary(existing));
      } else {
        showErrorSnack(context, e);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = widget.summary;
    return RefreshIndicator(
      onRefresh: () => ref.refresh(dischargeSummaryProvider(s.id).future),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          DischargeSummaryView(summary: s, showPatient: true),
          const SizedBox(height: 20),
          DischargeDownloads(summary: s),
          if (!s.isSuperseded) ...[
            const SizedBox(height: 20),
            Text(l10n.dischargeHpLockedNote, style: context.text.bodySmall),
            const SizedBox(height: 10),
            SecondaryButton(
              key: const ValueKey('discharge-hp-new-version'),
              label: l10n.dischargeHpNewVersion,
              icon: Icons.edit_note_rounded,
              onPressed: _busy ? null : _newVersion,
            ),
          ],
        ],
      ),
    );
  }
}

class _DraftEditor extends ConsumerStatefulWidget {
  const _DraftEditor({super.key, required this.summary});

  final DischargeSummary summary;

  @override
  ConsumerState<_DraftEditor> createState() => _DraftEditorState();
}

class _DraftEditorState extends ConsumerState<_DraftEditor> {
  final _form = GlobalKey<FormState>();
  late final _doctorName = TextEditingController(text: widget.summary.doctorName);
  late final _doctorRegistration = TextEditingController(text: widget.summary.doctorRegistration);
  late final _diagnosis = TextEditingController(text: widget.summary.diagnosis);
  late final _diagnosisCode = TextEditingController(text: widget.summary.diagnosisCode);
  late final _procedureName = TextEditingController(text: widget.summary.procedureName);
  late final _procedureCode = TextEditingController(text: widget.summary.procedureCode);
  late final _hospitalCourse = TextEditingController(text: widget.summary.hospitalCourse);
  late final _followUp = TextEditingController(text: widget.summary.followUpInstructions);
  late final _redFlags = TextEditingController(text: widget.summary.redFlagSymptoms);
  late final _allergies = TextEditingController(text: widget.summary.allergies);
  late final _investigations = TextEditingController(text: widget.summary.investigationsSummary);
  late String? _doctorId = widget.summary.doctorId;
  late DateTime? _admission = widget.summary.admissionDate;
  late DateTime? _discharge = widget.summary.dischargeDate;
  late DateTime? _procedureDate = widget.summary.procedureDate;
  late final List<DischargeMedication> _medications = [...widget.summary.medications];
  late final Set<String> _attachments = {for (final a in widget.summary.attachments) a.id};
  bool _busy = false;

  /// A doctor was picked from the list: the server fills the registration number unless one is typed.
  bool _registrationFromDoctor = false;

  List<TextEditingController> get _controllers => [
    _doctorName,
    _doctorRegistration,
    _diagnosis,
    _diagnosisCode,
    _procedureName,
    _procedureCode,
    _hospitalCourse,
    _followUp,
    _redFlags,
    _allergies,
    _investigations,
  ];

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    super.dispose();
  }

  DischargeDraft get _draft => DischargeDraft(
    doctorId: _doctorId,
    doctorName: _doctorName.text,
    doctorRegistration: _doctorRegistration.text,
    admissionDate: _admission,
    dischargeDate: _discharge,
    diagnosis: _diagnosis.text,
    diagnosisCode: _diagnosisCode.text,
    procedureName: _procedureName.text,
    procedureCode: _procedureCode.text,
    procedureDate: _procedureDate,
    hospitalCourse: _hospitalCourse.text,
    medications: _medications,
    followUpInstructions: _followUp.text,
    redFlagSymptoms: _redFlags.text,
    allergies: _allergies.text,
    investigationsSummary: _investigations.text,
    attachmentDocumentIds: _attachments.toList(),
    registrationFromDoctor: _registrationFromDoctor,
  );

  /// Validates and saves; returns false (with a message shown) when something is wrong.
  Future<bool> _save({bool quiet = false}) async {
    final l10n = context.l10n;
    if (!(_form.currentState?.validate() ?? false)) return false;
    if (_admission != null && _discharge != null && _discharge!.isBefore(_admission!)) {
      showInfoSnack(context, l10n.dischargeHpDatesInvalid);
      return false;
    }
    try {
      final saved = await ref.read(dischargeRepositoryProvider).update(widget.summary.id, _draft);
      if (_doctorRegistration.text.trim().isEmpty && (saved.doctorRegistration ?? '').isNotEmpty) {
        _doctorRegistration.text = saved.doctorRegistration!;
      }
      _registrationFromDoctor = false;
      ref.invalidate(dischargeSummariesProvider);
      if (mounted && !quiet) showInfoSnack(context, l10n.dischargeHpSaved);
      return true;
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
      return false;
    }
  }

  Future<void> _guard(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finalize() async {
    final l10n = context.l10n;
    final ok = await confirmAction(
      context,
      title: l10n.dischargeHpFinalizeTitle,
      message: l10n.dischargeHpFinalizeBody,
      confirmLabel: l10n.dischargeHpFinalize,
    );
    if (!ok || !mounted) return;
    await _guard(() => _doFinalize(l10n));
  }

  Future<void> _doFinalize(AppLocalizations l10n) async {
    if (!await _save(quiet: true) || !mounted) return;
    try {
      await ref.read(dischargeRepositoryProvider).finalize(widget.summary.id);
      ref
        ..invalidate(dischargeSummariesProvider)
        ..invalidate(dischargeSummaryProvider(widget.summary.id));
      if (mounted) showInfoSnack(context, l10n.dischargeHpFinalized);
    } catch (e) {
      if (!mounted) return;
      final api = ApiException.from(e);
      final missing = api.details;
      if (api.code == 'discharge_incomplete' && missing is List) {
        final names = missing.map((f) => dischargeFieldLabel(l10n, f.toString())).join(l10n.commonListSeparator);
        showInfoSnack(context, l10n.dischargeHpMissing(names));
      } else {
        showErrorSnack(context, e);
      }
    }
  }

  Future<void> _discard() async {
    final l10n = context.l10n;
    final ok = await confirmAction(
      context,
      title: l10n.dischargeHpDiscardTitle,
      message: l10n.dischargeHpDiscardBody,
      confirmLabel: l10n.dischargeHpDiscard,
      destructive: true,
    );
    if (!ok || !mounted) return;
    await _guard(() => _doDiscard(l10n));
  }

  Future<void> _doDiscard(AppLocalizations l10n) async {
    try {
      await ref.read(dischargeRepositoryProvider).discard(widget.summary.id);
      ref.invalidate(dischargeSummariesProvider);
      if (!mounted) return;
      showInfoSnack(context, l10n.dischargeHpDiscarded);
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(HospitalRoutes.dischargeSummaries(caseId: widget.summary.caseId));
      }
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    }
  }

  Future<void> _pickDate(DateTime? current, ValueChanged<DateTime?> set) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? now,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 1, 12, 31),
    );
    if (picked != null) setState(() => set(picked));
  }

  Future<void> _editMedication([int? index]) async {
    final result = await showDialog<DischargeMedication>(
      context: context,
      builder: (_) => _MedicationDialog(initial: index == null ? null : _medications[index]),
    );
    if (result == null) return;
    setState(() {
      if (index == null) {
        _medications.add(result);
      } else {
        _medications[index] = result;
      }
    });
  }

  Future<void> _chooseDoctor() async {
    final doctors = await ref.read(hospitalDoctorsProvider.future).catchError((_) => const <DoctorDetail>[]);
    if (!mounted) return;
    final picked = await showModalBottomSheet<DoctorDetail>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(ctx.l10n.dischargeHpChooseDoctor, style: ctx.text.titleMedium),
            ),
            for (final d in doctors)
              ListTile(
                leading: const Icon(Icons.badge_outlined),
                title: Text(d.fullName),
                subtitle: d.specialty == null ? null : Text(d.specialty!.name),
                trailing: d.id == _doctorId ? const Icon(Icons.check_rounded, color: AppColors.primary) : null,
                onTap: () => Navigator.of(ctx).pop(d),
              ),
          ],
        ),
      ),
    );
    if (picked == null) return;
    setState(() {
      _doctorId = picked.id;
      _doctorName.text = picked.fullName;
      // The server fills the registration number from the doctor's profile on save.
      _doctorRegistration.clear();
      _registrationFromDoctor = true;
    });
  }

  String? _codeValidator(String? v) {
    final t = (v ?? '').trim();
    return t.isEmpty || _codeRe.hasMatch(t) ? null : context.l10n.dischargeHpCodeInvalid;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = widget.summary;
    final prefill = ref.watch(dischargePrefillProvider((caseId: s.caseId, bookingId: s.bookingId)));
    final required = l10n.dischargeHpRequiredToFinalize;

    Widget field(
      TextEditingController c,
      String label, {
      Key? key,
      int maxLines = 1,
      String? helper,
      String? hint,
      int maxLength = 10000,
      FormFieldValidator<String>? validator,
    }) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        key: key,
        controller: c,
        enabled: !_busy,
        minLines: maxLines > 1 ? 2 : 1,
        maxLines: maxLines,
        inputFormatters: [LengthLimitingTextInputFormatter(maxLength)],
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(labelText: label, helperText: helper, hintText: hint, helperMaxLines: 2),
        validator: validator,
      ),
    );

    Widget dateTile(String label, DateTime? value, ValueChanged<DateTime?> set, {Key? key, String? helper}) => ListTile(
      key: key,
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.event_outlined),
      title: Text(label),
      subtitle: Text(value == null ? (helper ?? l10n.dischargeHpPickDate) : Dates.day(value)),
      trailing: value == null
          ? null
          : IconButton(
              tooltip: l10n.commonClear,
              icon: const Icon(Icons.clear_rounded),
              onPressed: _busy ? null : () => setState(() => set(null)),
            ),
      onTap: _busy ? null : () => _pickDate(value, set),
    );

    final attached = {for (final a in s.attachments) a.id: a};
    return Form(
      key: _form,
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                AppCard(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              s.patientName ?? '',
                              style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            Text(
                              [?s.caseNumber, l10n.dischargeVersion(s.version)].join(l10n.commonListSeparator),
                              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                            ),
                          ],
                        ),
                      ),
                      dischargeStatusBadge(context, status: s.status, latest: true),
                    ],
                  ),
                ),
                SectionTitle(l10n.dischargeHpDoctorSection),
                field(
                  _doctorName,
                  l10n.dischargeHpDoctorName,
                  key: const ValueKey('discharge-hp-doctor'),
                  helper: required,
                  maxLength: 200,
                ),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(
                    onPressed: _busy ? null : _chooseDoctor,
                    icon: const Icon(Icons.person_search_outlined),
                    label: Text(l10n.dischargeHpChooseDoctor),
                  ),
                ),
                field(_doctorRegistration, l10n.dischargeHpDoctorRegistration, maxLength: 80),
                SectionTitle(l10n.dischargeSectionStay),
                dateTile(l10n.dischargeAdmissionDate, _admission, (d) => _admission = d),
                dateTile(
                  l10n.dischargeDischargeDate,
                  _discharge,
                  (d) => _discharge = d,
                  key: const ValueKey('discharge-hp-discharge-date'),
                  helper: required,
                ),
                field(_procedureName, l10n.dischargeSectionProcedure, maxLength: 500),
                field(_procedureCode, l10n.dischargeHpProcedureCode, maxLength: 20, validator: _codeValidator),
                dateTile(l10n.dischargeProcedureDate, _procedureDate, (d) => _procedureDate = d),
                SectionTitle(l10n.dischargeSectionDiagnosis),
                field(
                  _diagnosis,
                  l10n.dischargeSectionDiagnosis,
                  key: const ValueKey('discharge-hp-diagnosis'),
                  maxLines: 5,
                  helper: required,
                ),
                field(_diagnosisCode, l10n.dischargeHpDiagnosisCode, maxLength: 20, validator: _codeValidator),
                field(_hospitalCourse, l10n.dischargeSectionHospitalCourse, maxLines: 6),
                field(_investigations, l10n.dischargeSectionInvestigations, maxLines: 5),
                SectionTitle(
                  l10n.dischargeSectionMedications,
                  actionLabel: l10n.dischargeHpAddMedication,
                  onAction: _busy ? null : () => _editMedication(),
                ),
                if (_medications.isEmpty)
                  Text(l10n.dischargeNoMedications, style: context.text.bodySmall)
                else
                  for (final (i, m) in _medications.indexed)
                    AppCard(
                      key: ValueKey('discharge-hp-med-$i'),
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 4, 10),
                      onTap: _busy ? null : () => _editMedication(i),
                      child: DischargeMedicationTile(
                        medication: m,
                        trailing: IconButton(
                          tooltip: l10n.commonRemove,
                          icon: const Icon(Icons.delete_outline_rounded, color: AppColors.danger),
                          onPressed: _busy ? null : () => setState(() => _medications.removeAt(i)),
                        ),
                      ),
                    ),
                TextButton.icon(
                  key: const ValueKey('discharge-hp-add-med'),
                  onPressed: _busy ? null : () => _editMedication(),
                  icon: const Icon(Icons.add_rounded),
                  label: Text(l10n.dischargeHpAddMedication),
                ),
                SectionTitle(l10n.dischargeSectionFollowUp),
                field(
                  _followUp,
                  l10n.dischargeSectionFollowUp,
                  key: const ValueKey('discharge-hp-follow-up'),
                  maxLines: 5,
                  helper: required,
                ),
                field(
                  _redFlags,
                  l10n.dischargeHpRedFlagsLabel,
                  key: const ValueKey('discharge-hp-red-flags'),
                  maxLines: 5,
                  helper: l10n.dischargeHpRedFlagsHint,
                ),
                field(_allergies, l10n.dischargeSectionAllergies, maxLines: 3),
                SectionTitle(l10n.dischargeSectionAttachments, subtitle: l10n.dischargeHpAttachmentsHint),
                prefill.when(
                  loading: () => const LinearProgressIndicator(minHeight: 2),
                  error: (e, _) => ErrorView(
                    error: e,
                    compact: true,
                    onRetry: () => ref.invalidate(dischargePrefillProvider((caseId: s.caseId, bookingId: s.bookingId))),
                  ),
                  data: (p) {
                    final docs = {...attached, for (final d in p.availableDocuments) d.id: d}.values.toList();
                    if (docs.isEmpty) return Text(l10n.dischargeHpNoDocuments, style: context.text.bodySmall);
                    return Column(
                      children: [
                        for (final d in docs)
                          CheckboxListTile(
                            key: ValueKey('discharge-hp-doc-${d.id}'),
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            controlAffinity: ListTileControlAffinity.leading,
                            value: _attachments.contains(d.id),
                            onChanged: _busy
                                ? null
                                : (v) => setState(() => v == true ? _attachments.add(d.id) : _attachments.remove(d.id)),
                            title: Text(d.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
                            subtitle: Text(d.toDocument().kind.label),
                          ),
                      ],
                    );
                  },
                ),
                const SizedBox(height: 16),
                Center(
                  child: TextButton.icon(
                    key: const ValueKey('discharge-hp-discard'),
                    style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                    onPressed: _busy ? null : _discard,
                    icon: const Icon(Icons.delete_outline_rounded),
                    label: Text(l10n.dischargeHpDiscard),
                  ),
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Row(
                children: [
                  Expanded(
                    child: SecondaryButton(
                      key: const ValueKey('discharge-hp-save'),
                      label: l10n.dischargeHpSaveDraft,
                      icon: Icons.save_outlined,
                      onPressed: _busy
                          ? null
                          : () => _guard(() async {
                              await _save();
                            }),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: PrimaryButton(
                      key: const ValueKey('discharge-hp-finalize'),
                      label: l10n.dischargeHpFinalize,
                      icon: Icons.verified_outlined,
                      loading: _busy,
                      onPressed: _busy ? null : _finalize,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Add / edit one medicine.
class _MedicationDialog extends StatefulWidget {
  const _MedicationDialog({this.initial});

  final DischargeMedication? initial;

  @override
  State<_MedicationDialog> createState() => _MedicationDialogState();
}

class _MedicationDialogState extends State<_MedicationDialog> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.initial?.name);
  late final _dose = TextEditingController(text: widget.initial?.dose);
  late final _frequency = TextEditingController(text: widget.initial?.frequency);
  late final _duration = TextEditingController(text: widget.initial?.durationDays?.toString());
  late final _route = TextEditingController(text: widget.initial?.route);
  late final _instructions = TextEditingController(text: widget.initial?.instructions);

  @override
  void dispose() {
    for (final c in [_name, _dose, _frequency, _duration, _route, _instructions]) {
      c.dispose();
    }
    super.dispose();
  }

  void _submit() {
    if (!(_form.currentState?.validate() ?? false)) return;
    String? t(TextEditingController c) => c.text.trim().isEmpty ? null : c.text.trim();
    Navigator.of(context).pop(
      DischargeMedication(
        name: _name.text.trim(),
        dose: t(_dose),
        frequency: t(_frequency),
        durationDays: int.tryParse(_duration.text.trim()),
        route: t(_route),
        instructions: t(_instructions),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    Widget f(
      TextEditingController c,
      String label, {
      Key? key,
      int max = 100,
      FormFieldValidator<String>? validator,
      TextInputType? type,
      int lines = 1,
    }) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextFormField(
        key: key,
        controller: c,
        keyboardType: type,
        maxLines: lines,
        inputFormatters: [
          LengthLimitingTextInputFormatter(max),
          if (type == TextInputType.number) FilteringTextInputFormatter.digitsOnly,
        ],
        decoration: InputDecoration(labelText: label),
        validator: validator,
      ),
    );
    return AlertDialog(
      title: Text(widget.initial == null ? l10n.dischargeHpAddMedication : l10n.dischargeHpEditMedication),
      content: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              f(
                _name,
                l10n.dischargeHpMedName,
                key: const ValueKey('discharge-med-name'),
                max: 200,
                validator: (v) => (v ?? '').trim().isEmpty ? l10n.dischargeHpMedNameRequired : null,
              ),
              f(_dose, l10n.dischargeHpMedDose, key: const ValueKey('discharge-med-dose')),
              f(_frequency, l10n.dischargeHpMedFrequency, key: const ValueKey('discharge-med-frequency')),
              f(
                _duration,
                l10n.dischargeHpMedDuration,
                key: const ValueKey('discharge-med-duration'),
                max: 4,
                type: TextInputType.number,
                validator: (v) {
                  final t = (v ?? '').trim();
                  if (t.isEmpty) return null;
                  final n = int.tryParse(t);
                  return n == null || n < 1 || n > 3650 ? l10n.dischargeHpMedDurationInvalid : null;
                },
              ),
              f(_route, l10n.dischargeHpMedRoute, max: 60),
              f(_instructions, l10n.dischargeHpMedInstructions, max: 500, lines: 3),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(l10n.commonCancel)),
        FilledButton(key: const ValueKey('discharge-med-save'), onPressed: _submit, child: Text(l10n.commonSave)),
      ],
    );
  }
}
