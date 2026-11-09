import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../agent_portal/shared/portal_account_menu.dart';
import '../../agent_portal/shared/portal_api.dart';
import '../../agent_portal/shared/portal_widgets.dart';
import '../../trips/services/file_actions.dart';
import '../data/hospital_models.dart';
import '../data/hospital_repository.dart';
import '../hospital_routes.dart';

// ------------------------------------------------------------------------------------------- more

/// "More" tab: itineraries, visa letters, doctors, price list, hospital switch and sign out.
class HospitalMoreScreen extends ConsumerWidget {
  const HospitalMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final hospitals = user?.hospitals ?? const <UserHospital>[];
    final active = ref.watch(activeHospitalProvider);
    final l10n = context.l10n;
    Widget link(IconData icon, String title, String subtitle, String route, {Key? key}) => AppCard(
      key: key,
      margin: const EdgeInsets.only(bottom: 10),
      onTap: () => context.push(route),
      child: Row(
        children: [
          Icon(icon, color: AppColors.primary),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(subtitle, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
    );
    return Scaffold(
      appBar: AppBar(title: Text(l10n.hpTabMore)),
      body: ListView(
        padding: AppSpacing.pageAll,
        children: [
          AppCard(
            margin: const EdgeInsets.only(bottom: 16),
            child: Row(
              children: [
                Avatar(name: user?.fullName ?? ''),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.fullName ?? '',
                        style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        [active?.name ?? '', active?.memberRole.label ?? ''].where((s) => s.isNotEmpty).join(' · '),
                        style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          link(Icons.route_outlined, l10n.hpItineraries, l10n.hpMoreItinerariesSubtitle, HospitalRoutes.itineraries),
          link(
            Icons.assignment_ind_outlined,
            l10n.hpVisaLettersTitle,
            l10n.hpMoreVisasSubtitle,
            HospitalRoutes.visas,
            key: const ValueKey('hospital-more-visas'),
          ),
          link(Icons.badge_outlined, l10n.hpDoctorsTitle, l10n.hpMoreDoctorsSubtitle, HospitalRoutes.doctors),
          link(
            Icons.price_change_outlined,
            l10n.priceListTitle,
            l10n.hpMorePriceListSubtitle,
            HospitalRoutes.priceList,
          ),
          if (hospitals.length > 1) ...[
            SectionTitle(l10n.hpActingFor),
            for (final h in hospitals)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  h.id == active?.id ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
                  color: h.id == active?.id ? AppColors.primary : null,
                ),
                title: Text(h.name),
                subtitle: Text(h.memberRole.label),
                onTap: () => ref.read(selectedHospitalIdProvider.notifier).select(h.id),
              ),
          ],
          const SizedBox(height: 16),
          Text(l10n.hpWebPortalNote, style: context.text.bodySmall?.copyWith(color: context.palette.textMuted)),
          const SizedBox(height: 12),
          SecondaryButton(
            label: l10n.commonLogOut,
            icon: Icons.logout_rounded,
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            key: const ValueKey('hospital-delete-account'),
            onPressed: () => confirmDeletePortalAccount(context),
            icon: const Icon(Icons.delete_forever_outlined, color: AppColors.danger),
            label: Text(l10n.commonDeleteAccount, style: const TextStyle(color: AppColors.danger)),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------------------------------ visas

/// Visa requests of the hospital's patients: issue invitation letters and track status.
class VisaRequestsScreen extends ConsumerStatefulWidget {
  const VisaRequestsScreen({super.key});

  @override
  ConsumerState<VisaRequestsScreen> createState() => _VisaRequestsScreenState();
}

class _VisaRequestsScreenState extends ConsumerState<VisaRequestsScreen> {
  VisaStatus? _status;

  @override
  Widget build(BuildContext context) {
    final visas = ref.watch(hospitalVisasProvider(_status));
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.hpVisaLettersTitle)),
      body: Column(
        children: [
          StatusFilterBar<VisaStatus>(
            options: VisaStatus.values,
            selected: _status,
            labelOf: (s) => s.label,
            onSelected: (s) => setState(() => _status = s),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(hospitalVisasProvider(_status)),
              child: AsyncValueView(
                value: visas,
                onRetry: () => ref.invalidate(hospitalVisasProvider(_status)),
                data: (list) => list.isEmpty
                    ? ListView(
                        children: [EmptyView(title: l10n.hpNoVisaRequests, icon: Icons.assignment_ind_outlined)],
                      )
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        children: [
                          for (final v in list)
                            AppCard(
                              margin: const EdgeInsets.only(bottom: 10),
                              onTap: () => _open(v),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          v.patientName ?? l10n.hpPatientFallback,
                                          style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                                        ),
                                        Text(
                                          [
                                            v.caseNumber ?? '',
                                            v.visaType.label,
                                            Dates.day(v.createdAt),
                                          ].where((s) => s.isNotEmpty).join(' · '),
                                          style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                                        ),
                                        if (v.needsInvitation)
                                          Text(
                                            l10n.hpInvitationLetterNeeded,
                                            style: context.text.labelSmall?.copyWith(color: AppColors.warning),
                                          ),
                                      ],
                                    ),
                                  ),
                                  StatusBadge.forEnum(v.status, dense: true),
                                ],
                              ),
                            ),
                        ],
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _open(HospitalVisaRequest v) async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _VisaSheet(visa: v),
    );
    if (changed == true) ref.invalidate(hospitalVisasProvider);
  }
}

class _VisaSheet extends ConsumerStatefulWidget {
  const _VisaSheet({required this.visa});

  final HospitalVisaRequest visa;

  @override
  ConsumerState<_VisaSheet> createState() => _VisaSheetState();
}

class _VisaSheetState extends ConsumerState<_VisaSheet> {
  late VisaStatus _status = widget.visa.status;
  late final _reference = TextEditingController(text: widget.visa.applicationReference);
  late final _notes = TextEditingController(text: widget.visa.notes);
  String? _letterId;
  String? _letterName;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _letterId = widget.visa.invitationLetterDocumentId;
  }

  @override
  void dispose() {
    _reference.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _uploadLetter() async {
    setState(() => _busy = true);
    try {
      final file = await pickDocumentFile();
      if (file == null) return;
      final doc = await ref
          .read(documentRepositoryProvider)
          .upload(
            fileName: file.name,
            bytes: file.bytes,
            kind: DocumentKind.invitationLetter,
            caseId: widget.visa.caseId,
            hospitalId: ref.read(activeHospitalProvider)?.id,
          );
      setState(() {
        _letterId = doc.id;
        _letterName = doc.fileName;
        if (_status == VisaStatus.notStarted || _status == VisaStatus.documentsPending) {
          _status = VisaStatus.invitationIssued;
        }
      });
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(hospitalRepositoryProvider)
          .updateVisa(
            widget.visa.id,
            status: _status,
            invitationLetterDocumentId: _letterId == widget.visa.invitationLetterDocumentId ? null : _letterId,
            applicationReference: _reference.text.trim(),
            notes: _notes.text.trim(),
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.visa;
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            v.patientName ?? l10n.hpVisaRequestFallback,
            style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          Text(
            '${v.caseNumber ?? ''} · ${v.visaType.label}',
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          const SizedBox(height: 12),
          AppCard(
            child: Row(
              children: [
                Icon(
                  _letterId == null ? Icons.upload_file_rounded : Icons.task_rounded,
                  color: _letterId == null ? AppColors.warning : AppColors.primary,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    _letterId == null
                        ? l10n.hpNoInvitationLetterYet
                        : _letterName == null
                        ? l10n.hpInvitationLetterUploaded
                        : l10n.hpInvitationLetterNamed(_letterName!),
                  ),
                ),
                TextButton(
                  onPressed: _busy ? null : _uploadLetter,
                  child: Text(_letterId == null ? l10n.commonUpload : l10n.hpReplace),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<VisaStatus>(
            initialValue: _status,
            decoration: InputDecoration(labelText: l10n.hpStatusLabel),
            items: [for (final s in VisaStatus.values) DropdownMenuItem(value: s, child: Text(s.label))],
            onChanged: (s) => setState(() => _status = s ?? _status),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reference,
            decoration: InputDecoration(labelText: l10n.hpEvisaReferenceLabel),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            maxLines: 2,
            decoration: InputDecoration(labelText: l10n.hpNotesLabel),
          ),
          const SizedBox(height: 16),
          PrimaryButton(label: l10n.commonSave, loading: _busy, onPressed: _busy ? null : _save),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------- doctors

/// The hospital's doctors (read-only on mobile).
class HospitalDoctorsScreen extends ConsumerWidget {
  const HospitalDoctorsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.hpDoctorsTitle)),
      body: AsyncValueView(
        value: ref.watch(hospitalDoctorsProvider),
        onRetry: () => ref.invalidate(hospitalDoctorsProvider),
        data: (list) => list.isEmpty
            ? EmptyView(title: l10n.hpNoDoctorsListed, icon: Icons.badge_outlined)
            : ListView(
                padding: AppSpacing.pageAll,
                children: [
                  for (final d in list)
                    AppCard(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Avatar(name: d.fullName, imageUrl: d.photoUrl, size: 52),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(d.fullName, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
                                Text(
                                  [
                                    ?d.specialty?.name,
                                    if (d.experienceYears != null) l10n.hpYearsShort(d.experienceYears!),
                                    if (d.qualifications.isNotEmpty) d.qualifications.join(', '),
                                  ].join(' · '),
                                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                                ),
                                const SizedBox(height: 4),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 4,
                                  children: [
                                    if (d.ratingAvg != null)
                                      RatingStars(rating: d.ratingAvg!, count: d.ratingCount, size: 14),
                                    if (d.teleconsultAvailable)
                                      StatusBadge(label: l10n.hpTeleconsultBadge, dense: true, color: AppColors.info),
                                    if (d.consultationFeeMinor != null)
                                      StatusBadge(
                                        label: l10n.hpConsultationFee(money(d.consultationFeeMinor!, d.currency)),
                                        dense: true,
                                        color: AppColors.violet,
                                      ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

// ------------------------------------------------------------------------------------- price list

/// Procedures with price ranges and packages (read-only on mobile).
class PriceListScreen extends ConsumerWidget {
  const PriceListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.priceListTitle)),
      body: AsyncValueView(
        value: ref.watch(hospitalProceduresProvider),
        onRetry: () => ref.invalidate(hospitalProceduresProvider),
        data: (list) => list.isEmpty
            ? EmptyView(title: l10n.priceListEmpty, icon: Icons.price_change_outlined)
            : ListView(
                padding: AppSpacing.pageAll,
                children: [
                  for (final p in list)
                    AppCard(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  p.procedure.name,
                                  style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                                ),
                              ),
                              Text(
                                formatMoneyRange(p.priceMinMinor, p.priceMaxMinor, p.currency),
                                style: context.text.titleSmall?.copyWith(color: AppColors.primary),
                              ),
                            ],
                          ),
                          Text(
                            [
                              if (p.hospitalStayDays != null) l10n.priceListStayDays(p.hospitalStayDays!),
                              if (p.successRatePct != null)
                                l10n.priceListSuccessRate(p.successRatePct!.toStringAsFixed(0)),
                            ].join(' · '),
                            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                          ),
                          for (final pk in p.packages)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Row(
                                children: [
                                  const Icon(Icons.inventory_2_outlined, size: 16),
                                  const SizedBox(width: 6),
                                  Expanded(child: Text('${pk.name} · ${pk.tier.label}')),
                                  Text(money(pk.priceMinor, pk.currency)),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}
