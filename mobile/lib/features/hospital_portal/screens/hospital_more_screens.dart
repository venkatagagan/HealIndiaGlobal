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
      appBar: AppBar(title: const Text('More')),
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
          link(Icons.route_outlined, 'Itineraries', 'Appointments, surgery slots, pickups', HospitalRoutes.itineraries),
          link(
            Icons.assignment_ind_outlined,
            'Visa invitation letters',
            'Medical visa requests from patients',
            HospitalRoutes.visas,
            key: const ValueKey('hospital-more-visas'),
          ),
          link(Icons.badge_outlined, 'Doctors', 'Your specialists and their profiles', HospitalRoutes.doctors),
          link(
            Icons.price_change_outlined,
            'Price list',
            'Procedures, price ranges and packages',
            HospitalRoutes.priceList,
          ),
          if (hospitals.length > 1) ...[
            const SectionTitle('Acting for'),
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
          Text(
            'Profile, members, availability and price edits are available on the hospital web portal.',
            style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
          ),
          const SizedBox(height: 12),
          SecondaryButton(
            label: 'Log out',
            icon: Icons.logout_rounded,
            onPressed: () => ref.read(authControllerProvider.notifier).logout(),
          ),
          const SizedBox(height: 8),
          TextButton.icon(
            key: const ValueKey('hospital-delete-account'),
            onPressed: () => confirmDeletePortalAccount(context),
            icon: const Icon(Icons.delete_forever_outlined, color: AppColors.danger),
            label: const Text('Delete account', style: TextStyle(color: AppColors.danger)),
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
    return Scaffold(
      appBar: AppBar(title: const Text('Visa invitation letters')),
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
                        children: const [EmptyView(title: 'No visa requests', icon: Icons.assignment_ind_outlined)],
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
                                          v.patientName ?? 'Patient',
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
                                            'Invitation letter needed',
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
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(v.patientName ?? 'Visa request', style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
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
                    _letterId == null ? 'No invitation letter yet' : 'Invitation letter: ${_letterName ?? 'uploaded'}',
                  ),
                ),
                TextButton(
                  onPressed: _busy ? null : _uploadLetter,
                  child: Text(_letterId == null ? 'Upload' : 'Replace'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<VisaStatus>(
            initialValue: _status,
            decoration: const InputDecoration(labelText: 'Status'),
            items: [for (final s in VisaStatus.values) DropdownMenuItem(value: s, child: Text(s.label))],
            onChanged: (s) => setState(() => _status = s ?? _status),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reference,
            decoration: const InputDecoration(labelText: 'e-Visa application reference'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _notes,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Notes'),
          ),
          const SizedBox(height: 16),
          PrimaryButton(label: 'Save', loading: _busy, onPressed: _busy ? null : _save),
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
    return Scaffold(
      appBar: AppBar(title: const Text('Doctors')),
      body: AsyncValueView(
        value: ref.watch(hospitalDoctorsProvider),
        onRetry: () => ref.invalidate(hospitalDoctorsProvider),
        data: (list) => list.isEmpty
            ? const EmptyView(title: 'No doctors listed', icon: Icons.badge_outlined)
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
                                    if (d.experienceYears != null) '${d.experienceYears} yrs',
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
                                      const StatusBadge(label: 'Tele-consult', dense: true, color: AppColors.info),
                                    if (d.consultationFeeMinor != null)
                                      StatusBadge(
                                        label: 'Fee ${money(d.consultationFeeMinor!, d.currency)}',
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
    return Scaffold(
      appBar: AppBar(title: const Text('Price list')),
      body: AsyncValueView(
        value: ref.watch(hospitalProceduresProvider),
        onRetry: () => ref.invalidate(hospitalProceduresProvider),
        data: (list) => list.isEmpty
            ? const EmptyView(title: 'No procedures priced yet', icon: Icons.price_change_outlined)
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
                              if (p.hospitalStayDays != null) '${p.hospitalStayDays} day stay',
                              if (p.successRatePct != null) '${p.successRatePct!.toStringAsFixed(0)}% success',
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
