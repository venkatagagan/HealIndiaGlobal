import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/discharge_repository.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../trips/services/file_actions.dart';

/// Status pill of a summary version: Draft, Final or Older version.
StatusBadge dischargeStatusBadge(BuildContext context, {required DischargeStatus status, required bool latest}) {
  final l10n = context.l10n;
  if (status == DischargeStatus.draft) {
    return StatusBadge(label: l10n.dischargeStatusDraft, color: AppColors.warning, dense: true);
  }
  if (!latest) {
    return StatusBadge(label: l10n.dischargeStatusSuperseded, color: context.palette.textSecondary, dense: true);
  }
  return StatusBadge(label: l10n.dischargeStatusFinal, color: AppColors.primary, dense: true);
}

/// Human name of a field reported missing by `discharge_incomplete`.
String dischargeFieldLabel(AppLocalizations l10n, String field) => switch (field) {
  'diagnosis' => l10n.dischargeSectionDiagnosis,
  'discharge_date' => l10n.dischargeDischargeDate,
  'doctor_name' => l10n.dischargeHpDoctorName,
  'follow_up_instructions' => l10n.dischargeSectionFollowUp,
  _ => field,
};

/// One line about a medicine: `500 mg · twice a day · oral · For 5 days`.
String medicationLine(AppLocalizations l10n, DischargeMedication m) => [
  ?m.dose,
  ?m.frequency,
  ?m.route,
  m.durationDays == null ? l10n.dischargeMedicationOngoing : l10n.dischargeMedicationDuration(m.durationDays!),
].where((s) => s.trim().isNotEmpty).join(l10n.commonListSeparator);

/// Read-only discharge summary: header, warning signs (prominent), diagnosis, stay, treatment, medicines,
/// follow-up, allergies, test results and attachments. Used by the patient, agent and hospital screens.
class DischargeSummaryView extends StatelessWidget {
  const DischargeSummaryView({super.key, required this.summary, this.showPatient = false});

  final DischargeSummary summary;

  /// Show the patient's name in the header (hospital and agent views).
  final bool showPatient;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final s = summary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      showPatient ? (s.patientName ?? s.hospitalName ?? '') : (s.hospitalName ?? ''),
                      style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  dischargeStatusBadge(context, status: s.status, latest: !s.isSuperseded),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                [
                  if (showPatient && s.hospitalName != null) s.hospitalName!,
                  ?s.caseNumber,
                  l10n.dischargeVersion(s.version),
                ].join(l10n.commonListSeparator),
                style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
              ),
              if (s.finalizedAt != null)
                Text(
                  l10n.dischargeFinalizedOn(Dates.day(s.finalizedAt)),
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
            ],
          ),
        ),
        if (s.isFinal && s.isSuperseded) ...[
          const SizedBox(height: 10),
          _Banner(icon: Icons.history_rounded, color: AppColors.warning, text: l10n.dischargeSupersededNote),
        ],
        if ((s.redFlagSymptoms ?? '').trim().isNotEmpty) ...[
          const SizedBox(height: 12),
          DischargeRedFlagsCard(text: s.redFlagSymptoms!),
        ],
        _Section(
          title: l10n.dischargeSectionDiagnosis,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text((s.diagnosis ?? '').isEmpty ? '—' : s.diagnosis!, style: context.text.bodyMedium),
              if ((s.diagnosisCode ?? '').isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    l10n.dischargeCode(s.diagnosisCode!),
                    style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                  ),
                ),
            ],
          ),
        ),
        _Section(
          title: l10n.dischargeSectionStay,
          child: Column(
            children: [
              _Row(l10n.dischargeAdmissionDate, Dates.day(s.admissionDate)),
              _Row(l10n.dischargeDischargeDate, Dates.day(s.dischargeDate)),
              _Row(l10n.dischargeSectionProcedure, s.procedureName),
              if ((s.procedureCode ?? '').isNotEmpty) _Row(l10n.dischargeProcedureCode, s.procedureCode),
              _Row(l10n.dischargeProcedureDate, Dates.day(s.procedureDate)),
              _Row(l10n.dischargeDoctor, s.doctorName),
              if ((s.doctorRegistration ?? '').isNotEmpty) _Row(l10n.dischargeDoctorRegistration, s.doctorRegistration),
            ],
          ),
        ),
        if ((s.hospitalCourse ?? '').trim().isNotEmpty)
          _Section(title: l10n.dischargeSectionHospitalCourse, child: Text(s.hospitalCourse!)),
        _Section(
          title: l10n.dischargeSectionMedications,
          child: s.medications.isEmpty
              ? Text(l10n.dischargeNoMedications, style: context.text.bodyMedium)
              : Column(
                  children: [
                    for (final (i, m) in s.medications.indexed) ...[
                      if (i > 0) const Divider(height: 20),
                      DischargeMedicationTile(medication: m),
                    ],
                  ],
                ),
        ),
        if ((s.followUpInstructions ?? '').trim().isNotEmpty)
          _Section(title: l10n.dischargeSectionFollowUp, child: Text(s.followUpInstructions!)),
        if ((s.allergies ?? '').trim().isNotEmpty)
          _Section(
            title: l10n.dischargeSectionAllergies,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.warning_amber_rounded, color: AppColors.warning, size: 20),
                const SizedBox(width: 8),
                Expanded(child: Text(s.allergies!)),
              ],
            ),
          ),
        if ((s.investigationsSummary ?? '').trim().isNotEmpty)
          _Section(title: l10n.dischargeSectionInvestigations, child: Text(s.investigationsSummary!)),
        if (s.attachments.isNotEmpty) ...[
          SectionTitle(l10n.dischargeSectionAttachments),
          for (final a in s.attachments) DischargeAttachmentTile(attachment: a),
        ],
      ],
    );
  }
}

/// The warning signs, in a red card that cannot be missed, with the emergency advice.
class DischargeRedFlagsCard extends StatelessWidget {
  const DischargeRedFlagsCard({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Semantics(
      container: true,
      child: AppCard(
        key: const ValueKey('discharge-red-flags'),
        color: AppColors.dangerSoft,
        borderColor: AppColors.danger,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.emergency_rounded, color: AppColors.danger),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    l10n.dischargeRedFlagsTitle,
                    style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(text, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: 10),
            Text(l10n.dischargeRedFlagsEmergency, style: context.text.bodySmall?.copyWith(fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class DischargeMedicationTile extends StatelessWidget {
  const DischargeMedicationTile({super.key, required this.medication, this.trailing});

  final DischargeMedication medication;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final m = medication;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(top: 2),
          child: Icon(Icons.medication_outlined, color: AppColors.violet),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(m.name, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
              Text(medicationLine(l10n, m), style: context.text.bodySmall),
              if ((m.instructions ?? '').isNotEmpty)
                Text(m.instructions!, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
            ],
          ),
        ),
        ?trailing,
      ],
    );
  }
}

/// An attached document: open (authorized download) or save.
class DischargeAttachmentTile extends ConsumerWidget {
  const DischargeAttachmentTile({super.key, required this.attachment});

  final DischargeAttachment attachment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final doc = attachment.toDocument();
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      onTap: () => openDocument(context, ref.read(documentRepositoryProvider), doc),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(documentKindIcon(doc.kind), color: AppColors.violet),
        title: Text(doc.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text('${doc.kind.label}${context.l10n.commonListSeparator}${doc.sizeLabel}'),
        trailing: IconButton(
          tooltip: context.l10n.commonDownload,
          icon: const Icon(Icons.download_rounded),
          onPressed: () => downloadDocument(context, ref.read(documentRepositoryProvider), doc),
        ),
      ),
    );
  }
}

/// "Download PDF" and "Download FHIR file" (authorized downloads, saved then opened when possible).
class DischargeDownloads extends ConsumerWidget {
  const DischargeDownloads({super.key, required this.summary});

  final DischargeSummary summary;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final repo = ref.read(dischargeRepositoryProvider);
    final s = summary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PrimaryButton(
          key: const ValueKey('discharge-pdf'),
          label: l10n.dischargeDownloadPdf,
          icon: Icons.picture_as_pdf_outlined,
          tone: ButtonTone.violet,
          onPressed: () => saveAndOpenBytes(
            context,
            load: () => repo.pdf(s.id),
            fileName: 'discharge-summary-${s.caseNumber ?? s.id}-v${s.version}.pdf',
            mimeType: 'application/pdf',
          ),
        ),
        const SizedBox(height: 10),
        SecondaryButton(
          key: const ValueKey('discharge-fhir'),
          label: l10n.dischargeDownloadFhir,
          icon: Icons.data_object_rounded,
          onPressed: () => saveAndOpenBytes(
            context,
            load: () => repo.fhir(s.id),
            fileName: 'discharge-summary-${s.caseNumber ?? s.id}-v${s.version}.fhir.json',
            mimeType: 'application/fhir+json',
            open: false,
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(
            l10n.dischargeFhirHint,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SectionTitle(title, padding: const EdgeInsets.only(top: 18, bottom: 8)),
      AppCard(
        child: DefaultTextStyle.merge(style: context.text.bodyMedium, child: child),
      ),
    ],
  );
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 130,
          child: Text(label, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
        ),
        Expanded(
          child: Text(
            (value == null || value!.isEmpty) ? '—' : value!,
            style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
      ],
    ),
  );
}

class _Banner extends StatelessWidget {
  const _Banner({required this.icon, required this.color, required this.text});

  final IconData icon;
  final Color color;
  final String text;

  @override
  Widget build(BuildContext context) => AppCard(
    color: color.withValues(alpha: 0.12),
    borderColor: color.withValues(alpha: 0.5),
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    child: Row(
      children: [
        Icon(icon, color: color),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: context.text.bodyMedium)),
      ],
    ),
  );
}
