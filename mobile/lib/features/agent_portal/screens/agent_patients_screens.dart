import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../trips/services/file_actions.dart';
import '../agent_routes.dart';
import '../data/agent_models.dart';
import '../data/agent_repository.dart';
import '../shared/portal_widgets.dart';

// ------------------------------------------------------------------------------------------ list

/// "My patients": search, list and add.
class AgentPatientsScreen extends ConsumerStatefulWidget {
  const AgentPatientsScreen({super.key});

  @override
  ConsumerState<AgentPatientsScreen> createState() => _AgentPatientsScreenState();
}

class _AgentPatientsScreenState extends ConsumerState<AgentPatientsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _q = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => setState(() => _q = v.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final patients = ref.watch(agentPatientsProvider(_q));
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.agentPatientsTitle)),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'agent-add-patient',
        onPressed: () => context.push(AgentRoutes.newPatient),
        icon: const Icon(Icons.person_add_alt_1_rounded),
        label: Text(l10n.agentAddPatient),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: TextField(
              controller: _search,
              onChanged: _onChanged,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search_rounded),
                hintText: l10n.agentPatientsSearchHint,
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(agentPatientsProvider(_q)),
              child: AsyncValueView(
                value: patients,
                onRetry: () => ref.invalidate(agentPatientsProvider(_q)),
                data: (page) => page.items.isEmpty
                    ? ListView(
                        children: [
                          EmptyView(
                            title: _q.isEmpty ? l10n.agentPatientsEmpty : l10n.agentPatientsNoMatch(_q),
                            message: l10n.agentPatientsEmptyHint,
                            icon: Icons.groups_outlined,
                          ),
                        ],
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
                        itemCount: page.items.length,
                        itemBuilder: (_, i) => _PatientTile(patient: page.items[i]),
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PatientTile extends StatelessWidget {
  const _PatientTile({required this.patient});

  final AgentPatient patient;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = patient;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      onTap: () => context.push(AgentRoutes.patient(p.id)),
      child: Row(
        children: [
          Avatar(name: p.fullName),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(p.fullName, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                Text(
                  [
                    ?p.nationality,
                    if (p.dateOfBirth != null) l10n.agentPatientAgeYears(Dates.age(p.dateOfBirth!)),
                    l10n.agentPatientCasesCount(p.casesCount),
                    l10n.agentPatientScreeningsCount(p.screeningsCount),
                  ].join(' · '),
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              ],
            ),
          ),
          if (!p.accountActivated) StatusBadge(label: l10n.agentPatientManaged, dense: true, color: AppColors.violet),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------------------------------ form

/// Add a patient (`POST /agent-portal/patients`) or edit one ([patientId] set).
class AgentPatientFormScreen extends ConsumerStatefulWidget {
  const AgentPatientFormScreen({super.key, this.patientId});

  final String? patientId;

  @override
  ConsumerState<AgentPatientFormScreen> createState() => _AgentPatientFormScreenState();
}

class _AgentPatientFormScreenState extends ConsumerState<AgentPatientFormScreen> {
  final _form = GlobalKey<FormState>();
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _nationality = TextEditingController();
  final _history = TextEditingController();
  final _passport = TextEditingController();
  final _allergies = TextEditingController();
  final _blood = TextEditingController();
  DateTime? _dob;
  DateTime? _passportExpiry;
  Gender? _gender;
  bool _saving = false;
  bool _loaded = false;

  bool get _isEdit => widget.patientId != null;

  @override
  void dispose() {
    for (final c in [_first, _last, _email, _phone, _nationality, _history, _passport, _allergies, _blood]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill(AgentPatient p) {
    if (_loaded) return;
    _loaded = true;
    _first.text = p.firstName ?? '';
    _last.text = p.lastName ?? '';
    _email.text = p.email ?? '';
    _phone.text = p.phone ?? '';
    _nationality.text = p.nationality ?? '';
    _history.text = p.medicalHistory ?? '';
    _allergies.text = p.allergies ?? '';
    _blood.text = p.bloodGroup ?? '';
    _dob = p.dateOfBirth;
    _passportExpiry = p.passportExpiry;
    _gender = p.gender;
  }

  Future<void> _pickDate({required bool dob}) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: (dob ? _dob : _passportExpiry) ?? (dob ? DateTime(now.year - 40) : DateTime(now.year + 2)),
      firstDate: dob ? DateTime(1900) : now,
      lastDate: dob ? now : DateTime(now.year + 20),
    );
    if (picked != null) setState(() => dob ? _dob = picked : _passportExpiry = picked);
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() => _saving = true);
    final input = AgentPatientInput(
      firstName: _first.text,
      lastName: _last.text,
      nationality: _nationality.text,
      email: _email.text,
      phone: _phone.text,
      dateOfBirth: _dob,
      gender: _gender,
      medicalHistory: _history.text,
      passportNumber: _passport.text,
      passportExpiry: _passportExpiry,
      allergies: _allergies.text,
      bloodGroup: _blood.text,
    );
    final repo = ref.read(agentRepositoryProvider);
    try {
      final saved = _isEdit ? await repo.updatePatient(widget.patientId!, input) : await repo.createPatient(input);
      ref
        ..invalidate(agentPatientsProvider)
        ..invalidate(agentPatientProvider(saved.id))
        ..invalidate(agentDashboardProvider);
      if (!mounted) return;
      showInfoSnack(context, _isEdit ? context.l10n.agentPatientUpdated : context.l10n.agentPatientAdded);
      if (_isEdit) {
        context.pop();
      } else {
        context.pushReplacement(AgentRoutes.patient(saved.id));
      }
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String? _required(String? v) => (v == null || v.trim().isEmpty) ? context.l10n.agentFormRequired : null;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (_isEdit) {
      final existing = ref.watch(agentPatientProvider(widget.patientId!));
      if (!existing.hasValue) {
        return Scaffold(
          appBar: AppBar(title: Text(l10n.agentEditPatient)),
          body: AsyncValueView(
            value: existing,
            onRetry: () => ref.invalidate(agentPatientProvider(widget.patientId!)),
            data: (_) => const SizedBox.shrink(),
          ),
        );
      }
      _fill(existing.requireValue);
    }
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? l10n.agentEditPatient : l10n.agentAddPatient)),
      body: Form(
        key: _form,
        child: ListView(
          padding: AppSpacing.pageAll,
          children: [
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    key: const ValueKey('patient-first-name'),
                    controller: _first,
                    textCapitalization: TextCapitalization.words,
                    decoration: InputDecoration(labelText: l10n.agentPatientFirstName),
                    validator: _required,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    key: const ValueKey('patient-last-name'),
                    controller: _last,
                    textCapitalization: TextCapitalization.words,
                    decoration: InputDecoration(labelText: l10n.agentPatientLastName),
                    validator: _required,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              key: const ValueKey('patient-nationality'),
              controller: _nationality,
              textCapitalization: TextCapitalization.characters,
              maxLength: 2,
              decoration: InputDecoration(labelText: l10n.agentPatientNationalityLabel, counterText: ''),
              validator: (v) =>
                  RegExp(r'^[A-Za-z]{2}$').hasMatch((v ?? '').trim()) ? null : l10n.agentPatientNationalityInvalid,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(
                labelText: l10n.agentPatientEmailOptional,
                helperText: l10n.agentPatientEmailHelper,
              ),
              validator: (v) {
                final s = (v ?? '').trim();
                return s.isEmpty || RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s)
                    ? null
                    : l10n.agentPatientEmailInvalid;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(labelText: l10n.agentPatientPhoneOptional),
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.cake_outlined),
              title: Text(_dob == null ? l10n.agentPatientDobOptional : Dates.day(_dob)),
              trailing: const Icon(Icons.edit_calendar_outlined),
              onTap: () => _pickDate(dob: true),
            ),
            const SizedBox(height: 4),
            SegmentedButton<Gender?>(
              segments: [
                ButtonSegment(value: Gender.female, label: Text(Gender.female.label)),
                ButtonSegment(value: Gender.male, label: Text(Gender.male.label)),
                ButtonSegment(value: Gender.other, label: Text(Gender.other.label)),
              ],
              emptySelectionAllowed: true,
              selected: {?_gender},
              onSelectionChanged: (s) => setState(() => _gender = s.isEmpty ? null : s.first),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _history,
              maxLines: 4,
              decoration: InputDecoration(labelText: l10n.agentPatientMedicalHistoryOptional),
            ),
            if (_isEdit) ...[
              SectionTitle(l10n.agentPatientTravelMedicalSection),
              TextFormField(
                controller: _passport,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(
                  labelText: l10n.agentPatientPassportNumber,
                  helperText: l10n.agentPatientPassportKeepHelper,
                ),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.badge_outlined),
                title: Text(
                  _passportExpiry == null
                      ? l10n.agentPatientPassportExpiry
                      : l10n.agentPatientPassportExpires(Dates.day(_passportExpiry)),
                ),
                trailing: const Icon(Icons.edit_calendar_outlined),
                onTap: () => _pickDate(dob: false),
              ),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _blood,
                      decoration: InputDecoration(labelText: l10n.agentPatientBloodGroup),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: TextFormField(
                      controller: _allergies,
                      decoration: InputDecoration(labelText: l10n.agentPatientAllergies),
                    ),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 24),
            PrimaryButton(
              key: const ValueKey('patient-save'),
              label: _isEdit ? l10n.agentSaveChanges : l10n.agentAddPatient,
              loading: _saving,
              onPressed: _saving ? null : _save,
            ),
          ],
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------------------------------ detail

/// One managed patient: profile, screenings, cases, documents and actions.
class AgentPatientDetailScreen extends ConsumerWidget {
  const AgentPatientDetailScreen({super.key, required this.patientId});

  final String patientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final patient = ref.watch(agentPatientProvider(patientId));
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(
        title: Text(patient.value?.fullName ?? l10n.portalPatientLabel),
        actions: [
          IconButton(
            tooltip: l10n.commonEdit,
            icon: const Icon(Icons.edit_outlined),
            onPressed: () => context.push(AgentRoutes.editPatient(patientId)),
          ),
        ],
      ),
      body: AsyncValueView(
        value: patient,
        onRetry: () => ref.invalidate(agentPatientProvider(patientId)),
        data: (p) => RefreshIndicator(
          onRefresh: () async {
            ref
              ..invalidate(agentPatientProvider(patientId))
              ..invalidate(patientCasesProvider(patientId))
              ..invalidate(patientScreeningsProvider(patientId))
              ..invalidate(patientDocumentsProvider(patientId));
          },
          child: ListView(
            padding: AppSpacing.pageAll,
            children: [
              _PatientHeader(patient: p),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: PrimaryButton(
                      key: const ValueKey('agent-run-screening'),
                      label: l10n.agentRunScreening,
                      icon: Icons.health_and_safety_outlined,
                      onPressed: () => context.push(AgentRoutes.newScreening(p.id)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SecondaryButton(
                      label: l10n.agentRequestQuote,
                      icon: Icons.request_quote_outlined,
                      onPressed: () => context.push(AgentRoutes.requestQuote(p.id)),
                    ),
                  ),
                ],
              ),
              _ScreeningsSection(patientId: p.id),
              _CasesSection(patientId: p.id),
              _DocumentsSection(patientId: p.id),
            ],
          ),
        ),
      ),
    );
  }
}

class _PatientHeader extends StatelessWidget {
  const _PatientHeader({required this.patient});

  final AgentPatient patient;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final p = patient;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Avatar(name: p.fullName, size: 52),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.fullName, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
                    Text(
                      p.accountActivated ? l10n.agentPatientAccountActivated : l10n.agentPatientInvitePending,
                      style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: 24),
          InfoRow(l10n.agentPatientNationality, p.nationality),
          InfoRow(
            l10n.agentPatientDob,
            p.dateOfBirth == null
                ? null
                : l10n.agentPatientDobWithAge(Dates.day(p.dateOfBirth), Dates.age(p.dateOfBirth!)),
          ),
          InfoRow(l10n.agentPatientGender, p.gender?.label),
          InfoRow(l10n.agentPatientEmail, p.email),
          InfoRow(l10n.agentPatientPhone, p.phone),
          InfoRow(
            l10n.agentPatientPassport,
            p.passportLast4 == null
                ? null
                : '•••• ${p.passportLast4}'
                      '${p.passportExpiry == null ? '' : ' · ${l10n.agentPatientPassportExpShort(Dates.day(p.passportExpiry))}'}',
          ),
          if ((p.medicalHistory ?? '').isNotEmpty) InfoRow(l10n.agentPatientMedicalHistory, p.medicalHistory),
          if ((p.allergies ?? '').isNotEmpty) InfoRow(l10n.agentPatientAllergies, p.allergies),
        ],
      ),
    );
  }
}

class _ScreeningsSection extends ConsumerWidget {
  const _ScreeningsSection({required this.patientId});

  final String patientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(l10n.agentScreeningsSection),
        AsyncValueView(
          value: ref.watch(patientScreeningsProvider(patientId)),
          compactError: true,
          onRetry: () => ref.invalidate(patientScreeningsProvider(patientId)),
          data: (list) => list.isEmpty
              ? Text(
                  l10n.agentScreeningsEmpty,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                )
              : Column(
                  children: [
                    for (final s in list)
                      AppCard(
                        margin: const EdgeInsets.only(bottom: 8),
                        onTap: () => context.push(AgentRoutes.screening(s.id)),
                        child: Row(
                          children: [
                            const Icon(Icons.monitor_heart_outlined, color: AppColors.danger),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    s.specialty?.name ?? l10n.agentGeneralScreening,
                                    style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                                  ),
                                  Text(
                                    Dates.day(s.createdAt),
                                    style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                                  ),
                                ],
                              ),
                            ),
                            StatusBadge.forEnum(s.status, dense: true),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _CasesSection extends ConsumerWidget {
  const _CasesSection({required this.patientId});

  final String patientId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cases = ref.watch(patientCasesProvider(patientId));
    final quoted = (cases.value ?? const <MedicalCase>[]).where((c) => c.latestQuote != null).length;
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(
          l10n.agentCasesTitle,
          actionLabel: quoted >= 1 ? l10n.agentCompareQuotes : null,
          onAction: quoted >= 1 ? () => context.push(AgentRoutes.compare(patientId)) : null,
        ),
        AsyncValueView(
          value: cases,
          compactError: true,
          onRetry: () => ref.invalidate(patientCasesProvider(patientId)),
          data: (list) => list.isEmpty
              ? Text(
                  l10n.agentPatientCasesEmpty,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                )
              : Column(
                  children: [
                    for (final c in list)
                      CaseTile(
                        medicalCase: c,
                        showPatient: false,
                        onTap: () => context.push(AgentRoutes.caseDetail(c.id)),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _DocumentsSection extends ConsumerStatefulWidget {
  const _DocumentsSection({required this.patientId});

  final String patientId;

  @override
  ConsumerState<_DocumentsSection> createState() => _DocumentsSectionState();
}

class _DocumentsSectionState extends ConsumerState<_DocumentsSection> {
  bool _uploading = false;

  Future<void> _upload() async {
    final kind = await showModalBottomSheet<DocumentKind>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final k in const [
              DocumentKind.medicalReport,
              DocumentKind.labResult,
              DocumentKind.imaging,
              DocumentKind.prescription,
              DocumentKind.passport,
              DocumentKind.other,
            ])
              ListTile(title: Text(k.label), onTap: () => Navigator.of(ctx).pop(k)),
          ],
        ),
      ),
    );
    if (kind == null || !mounted) return;
    setState(() => _uploading = true);
    try {
      final file = await pickDocumentFile();
      if (file == null) return;
      await ref
          .read(documentRepositoryProvider)
          .upload(fileName: file.name, bytes: file.bytes, kind: kind, patientId: widget.patientId);
      ref.invalidate(patientDocumentsProvider(widget.patientId));
      if (mounted) showInfoSnack(context, context.l10n.agentDocumentUploaded(file.name));
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final docs = ref.watch(patientDocumentsProvider(widget.patientId));
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(
          l10n.agentDocumentsSection,
          actionLabel: _uploading ? l10n.agentDocumentUploading : l10n.commonUpload,
          onAction: _uploading ? null : _upload,
        ),
        AsyncValueView(
          value: docs,
          compactError: true,
          onRetry: () => ref.invalidate(patientDocumentsProvider(widget.patientId)),
          data: (list) => list.isEmpty
              ? Text(
                  l10n.agentDocumentsEmpty,
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                )
              : Column(
                  children: [
                    for (final d in list)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(d.isPdf ? Icons.picture_as_pdf_outlined : Icons.image_outlined),
                        title: Text(d.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text('${d.kind.label} · ${d.sizeLabel} · ${Dates.day(d.createdAt)}'),
                        trailing: IconButton(
                          tooltip: l10n.commonDownload,
                          icon: const Icon(Icons.download_rounded),
                          onPressed: () => downloadDocument(context, ref.read(documentRepositoryProvider), d),
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}
