import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_repository.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../booking/widgets/availability_calendar.dart';
import '../../quotes/screens/quick_quote_screen.dart' show reportFilePickerProvider;
import '../../screening/providers/emergency_ack.dart';
import '../data/consultation_providers.dart';

/// Opens the pre-travel video consultation booking for [hospitalId] (optionally a preselected doctor).
Future<void> bookVideoConsultation(
  BuildContext context, {
  required String hospitalId,
  String? doctorId,
  String? screeningId,
  String? specialtyId,
  String? procedureId,
}) => context.push(
  Routes.consultationBook(
    hospitalId: hospitalId,
    doctorId: doctorId,
    screeningId: screeningId,
    specialtyId: specialtyId,
    procedureId: procedureId,
  ),
);

/// Pre-travel video tele-consultation: doctor (tele-consult doctors of the hospital) -> preferred day from the
/// doctor's consultation availability and a time -> question + reports -> consent to share with the hospital.
/// Submitting reuses the patient's open case at that hospital (or creates one, `POST /cases`), then
/// `POST /consultations`; a fee is paid next on the consultation page.
///
/// Route: `/consultations/book?hospital=&doctor=&screening=&specialty=&procedure=`.
class ConsultationBookScreen extends ConsumerStatefulWidget {
  const ConsultationBookScreen({
    super.key,
    required this.hospitalId,
    this.doctorId,
    this.screeningId,
    this.specialtyId,
    this.procedureId,
  });

  final String hospitalId;
  final String? doctorId;
  final String? screeningId;
  final String? specialtyId;
  final String? procedureId;

  @override
  ConsumerState<ConsultationBookScreen> createState() => _ConsultationBookScreenState();
}

class _ConsultationBookScreenState extends ConsumerState<ConsultationBookScreen> {
  late String? _doctorId = widget.doctorId;
  DateTime _month = DateTime(DateTime.now().year, DateTime.now().month);
  DateTime? _day;
  int? _hourIst;
  final _notes = TextEditingController();
  final Set<String> _documentIds = {};
  final List<AppDocument> _uploaded = [];
  bool _consent = false;
  bool _busy = false;
  bool _uploading = false;
  String? _error;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  void _selectDoctor(String id) => setState(() {
    _doctorId = id;
    _day = null;
    _hourIst = null;
  });

  Future<void> _upload(MedicalCase? openCase) async {
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final file = await ref.read(reportFilePickerProvider)();
      if (file == null) return;
      final doc = await ref
          .read(documentRepositoryProvider)
          .upload(fileName: file.name, bytes: file.bytes, kind: DocumentKind.medicalReport, caseId: openCase?.id);
      if (!mounted) return;
      setState(() {
        _uploaded.add(doc);
        _documentIds.add(doc.id);
      });
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  String _apiError(Object e, AppLocalizations l10n) {
    if (e is ApiException) {
      switch (e.code) {
        case 'consultation_exists':
          return l10n.consultErrorExists;
        case 'teleconsult_unavailable':
          return l10n.consultErrorUnavailable;
        case 'doctor_required':
          return l10n.consultErrorDoctorRequired;
        case 'invalid_doctor':
          return l10n.consultErrorInvalidDoctor;
      }
      if (isGuestUpgradeRequired(e)) return l10n.consultationGuestUpgrade;
    }
    return errorMessage(e);
  }

  Future<void> _submit(String hospitalName) async {
    final l10n = context.l10n;
    final doctorId = _doctorId;
    if (doctorId == null) return setState(() => _error = l10n.consultPickDoctor);
    if (_day == null || _hourIst == null) return setState(() => _error = l10n.consultPickSlot);
    if (!_consent) return setState(() => _error = l10n.consultationConsentRequired);
    if (_busy) return;

    var gate = EmergencyGate.clear;
    if (widget.screeningId != null) {
      gate = await ensureEmergencyAcknowledged(context, screeningId: widget.screeningId!);
      if (!gate.allowed || !mounted) return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // Consent to share with hospitals (PLAN §9.9) before anything reaches the hospital.
      try {
        await ref.read(authRepositoryProvider).recordConsent(kind: ConsentKind.shareWithHospitals, granted: true);
      } on ApiException catch (e) {
        if (e.isNetwork) rethrow;
      }
      final cases = ref.read(caseRepositoryProvider);
      final notes = _notes.text.trim();
      var medicalCase = await ref.read(openCaseAtHospitalProvider(widget.hospitalId).future);
      if (medicalCase == null) {
        medicalCase = await cases.create(
          hospitalId: widget.hospitalId,
          doctorId: doctorId,
          procedureId: widget.procedureId,
          specialtyId: widget.specialtyId,
          screeningId: widget.screeningId,
          patientNotes: notes,
          documentIds: _documentIds.toList(),
          consentShare: true,
        );
        if (gate == EmergencyGate.acknowledged) {
          try {
            await ref.read(caseEmergencyApiProvider).acknowledge(medicalCase.id);
          } catch (_) {
            // Booking asks again later (409 `emergency_ack_required`).
          }
        }
        ref.invalidate(casesProvider);
      }
      final consultation = await cases.requestConsultation(
        caseId: medicalCase.id,
        doctorId: doctorId,
        preferredAt: consultationSlotUtc(_day!, _hourIst!),
        notes: notes,
      );
      ref.invalidate(myConsultationsProvider);
      ref.invalidate(openCaseAtHospitalProvider(widget.hospitalId));
      if (!mounted) return;
      showInfoSnack(context, l10n.consultRequestedSnack);
      context.pushReplacement(Routes.consultationDetail(consultation.id, pay: (consultation.feeMinor ?? 0) > 0));
    } on Object catch (e) {
      if (!mounted) return;
      if (await handleGuardianConsentError(context, e)) return;
      if (mounted) setState(() => _error = _apiError(e, l10n));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final doctors = ref.watch(teleconsultDoctorsProvider(widget.hospitalId));
    final hospital = ref.watch(hospitalDetailProvider(widget.hospitalId)).value;
    final list = doctors.value ?? const <DoctorCard>[];
    final doctor = list.where((d) => d.id == _doctorId).firstOrNull ?? (list.length == 1 ? list.first : null);
    // Only a tele-consult doctor of this hospital can be booked; a preselected doctor who does not offer video
    // consultations is dropped (the only such doctor, if there is just one, is picked).
    if (doctors.hasValue) _doctorId = doctor?.id;
    final hospitalName = hospital?.name ?? doctor?.hospital.name ?? '';
    return Scaffold(
      appBar: AppBar(title: Text(l10n.consultBookTitle)),
      body: AsyncValueView<List<DoctorCard>>(
        value: doctors,
        onRetry: () => ref.invalidate(teleconsultDoctorsProvider(widget.hospitalId)),
        data: (items) {
          if (items.isEmpty) {
            return EmptyView(
              icon: Icons.videocam_off_outlined,
              title: l10n.consultNoTeleconsultDoctors(hospitalName),
              actionLabel: l10n.consultRequestQuoteInstead,
              onAction: () => context.pushReplacement(
                Routes.quickQuote(
                  hospitalIds: [widget.hospitalId],
                  procedureId: widget.procedureId,
                  specialtyId: widget.specialtyId,
                  screeningId: widget.screeningId,
                ),
              ),
            );
          }
          return _form(context, items, doctor, hospitalName);
        },
      ),
    );
  }

  Widget _form(BuildContext context, List<DoctorCard> doctors, DoctorCard? doctor, String hospitalName) {
    final l10n = context.l10n;
    final openCase = ref.watch(openCaseAtHospitalProvider(widget.hospitalId)).value;
    return ListView(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 16, 32),
      children: [
        Text(l10n.consultBookIntro, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
        if (hospitalName.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(hospitalName, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        ],
        SectionTitle(l10n.consultDoctorSection),
        for (final d in doctors)
          _DoctorOption(doctor: d, selected: d.id == doctor?.id, onTap: _busy ? null : () => _selectDoctor(d.id)),
        if (doctor != null) ..._slotSection(context, doctor),
        SectionTitle(l10n.consultReportsSection, subtitle: l10n.consultReportsHint),
        ..._reports(context, openCase, hospitalName),
        const SizedBox(height: 8),
        TextField(
          key: const ValueKey('consult-notes'),
          controller: _notes,
          minLines: 3,
          maxLines: 6,
          maxLength: 2000,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: l10n.consultQuestionLabel,
            hintText: l10n.consultQuestionHint,
            alignLabelWithHint: true,
          ),
        ),
        if (doctor != null) _fee(context, doctor),
        CheckboxListTile(
          key: const ValueKey('consult-consent'),
          value: _consent,
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          activeColor: AppColors.primary,
          onChanged: _busy ? null : (v) => setState(() => _consent = v ?? false),
          title: Text(l10n.consultationConsent(hospitalName), style: context.text.bodySmall),
        ),
        if (_error != null) ...[
          const SizedBox(height: 4),
          Text(
            _error!,
            key: const ValueKey('consult-error'),
            style: context.text.bodySmall?.copyWith(color: AppColors.danger),
          ),
        ],
        const SizedBox(height: 12),
        PrimaryButton(
          key: const ValueKey('consult-submit'),
          label: l10n.consultSubmit,
          icon: Icons.videocam_rounded,
          loading: _busy,
          onPressed: () => _submit(hospitalName),
        ),
      ],
    );
  }

  List<Widget> _slotSection(BuildContext context, DoctorCard doctor) {
    final l10n = context.l10n;
    final query = (doctorId: doctor.id, month: _month);
    final async = ref.watch(consultationAvailabilityProvider(query));
    final availability = async.value ?? (async.hasError ? ConsultationAvailability.unrestricted() : null);
    final thisMonth = DateTime(DateTime.now().year, DateTime.now().month);
    final zone = DateTime.now().timeZoneName;
    return [
      SectionTitle(l10n.consultDateSection, subtitle: l10n.consultDateHint),
      AvailabilityCalendar(
        month: _month,
        selected: _day,
        loading: async.isLoading,
        firstMonth: thisMonth,
        lastMonth: DateTime(thisMonth.year, thisMonth.month + 6),
        isAvailable: (d) => availability?.isAvailable(d) ?? false,
        onSelect: (d) => setState(() {
          _day = d;
          _error = null;
        }),
        onMonthChanged: (m) => setState(() => _month = DateTime(m.year, m.month)),
      ),
      if (_day != null) ...[
        SectionTitle(l10n.consultTimeSection, subtitle: l10n.consultTimesLocal(zone)),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final h in consultationSlotHoursIst)
              ChoiceChip(
                key: ValueKey('consult-time-$h'),
                label: Text(Dates.time(consultationSlotUtc(_day!, h).toLocal())),
                selected: _hourIst == h,
                onSelected: (_) => setState(() {
                  _hourIst = h;
                  _error = null;
                }),
              ),
          ],
        ),
      ],
    ];
  }

  List<Widget> _reports(BuildContext context, MedicalCase? openCase, String hospitalName) {
    final l10n = context.l10n;
    final mine = openCase == null
        ? (ref.watch(documentsProvider((caseId: null, kind: null))).value ?? const <AppDocument>[])
        : const <AppDocument>[];
    final docs = [..._uploaded, ...mine.where((d) => !_uploaded.any((u) => u.id == d.id))];
    return [
      if (openCase != null)
        Text(
          l10n.consultReportsExistingCase(openCase.caseNumber, hospitalName),
          style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
        ),
      for (final d in docs)
        CheckboxListTile(
          key: ValueKey('consult-doc-${d.id}'),
          value: openCase != null || _documentIds.contains(d.id),
          onChanged: openCase != null
              ? null
              : (v) => setState(() => v == true ? _documentIds.add(d.id) : _documentIds.remove(d.id)),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
          title: Text(d.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text(d.kind.label),
        ),
      Align(
        alignment: AlignmentDirectional.centerStart,
        child: TextButton.icon(
          key: const ValueKey('consult-upload'),
          icon: _uploading
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.upload_file_rounded),
          label: Text(l10n.consultUpload),
          onPressed: _uploading || _busy ? null : () => _upload(openCase),
        ),
      ),
    ];
  }

  Widget _fee(BuildContext context, DoctorCard doctor) {
    final l10n = context.l10n;
    final fee = doctor.consultationFeeMinor ?? 0;
    return AppCard(
      key: const ValueKey('consult-fee'),
      margin: const EdgeInsets.only(top: 8, bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(l10n.consultFeeLabel, style: context.text.titleSmall)),
              if (fee > 0)
                PriceText(
                  fee,
                  doctor.currency,
                  display: doctor.displayConsultationFee,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  style: context.text.titleSmall,
                )
              else
                Text(l10n.consultFeeFree, style: context.text.titleSmall?.copyWith(color: AppColors.primary)),
            ],
          ),
          if (fee > 0) ...[
            const SizedBox(height: 6),
            Text(l10n.consultFeePayNote, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
          ],
        ],
      ),
    );
  }
}

class _DoctorOption extends StatelessWidget {
  const _DoctorOption({required this.doctor, required this.selected, required this.onTap});

  final DoctorCard doctor;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final d = doctor;
    return AppCard(
      key: ValueKey('consult-doctor-${d.id}'),
      margin: const EdgeInsets.only(bottom: 8),
      onTap: onTap,
      child: Row(
        children: [
          Avatar(name: d.fullName, imageUrl: d.photoUrl, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(d.fullName, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                if (d.subtitle.isNotEmpty)
                  Text(d.subtitle, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
              ],
            ),
          ),
          Icon(
            selected ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
            color: selected ? AppColors.primary : context.palette.textMuted,
          ),
        ],
      ),
    );
  }
}
