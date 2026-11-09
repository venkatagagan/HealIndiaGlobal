import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../agent_portal/shared/portal_widgets.dart';
import '../data/hospital_models.dart';
import '../data/hospital_repository.dart';
import '../hospital_routes.dart';

// ------------------------------------------------------------------------------------- admissions

/// Admissions & discharges: upcoming (confirmed), in treatment (admitted), discharged, awaiting payment.
class AdmissionsScreen extends ConsumerStatefulWidget {
  const AdmissionsScreen({super.key});

  @override
  ConsumerState<AdmissionsScreen> createState() => _AdmissionsScreenState();
}

class _AdmissionsScreenState extends ConsumerState<AdmissionsScreen> {
  BookingStatus _status = BookingStatus.confirmed;

  /// Filter chips: status -> (chip label, empty-state title).
  static Map<BookingStatus, (String, String)> _labels(AppLocalizations l) => {
    BookingStatus.confirmed: (l.hpAdmissionsUpcoming, l.hpAdmissionsEmptyUpcoming),
    BookingStatus.admitted: (l.hpKpiInTreatment, l.hpAdmissionsEmptyInTreatment),
    BookingStatus.completed: (l.hpAdmissionsDischarged, l.hpAdmissionsEmptyDischarged),
    BookingStatus.pendingPayment: (l.hpAdmissionsAwaitingPayment, l.hpAdmissionsEmptyAwaitingPayment),
    BookingStatus.cancelled: (l.hpAdmissionsCancelled, l.hpAdmissionsEmptyCancelled),
  };

  @override
  Widget build(BuildContext context) {
    final bookings = ref.watch(hospitalBookingsProvider(_status));
    final l10n = context.l10n;
    final labels = _labels(l10n);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.hpAdmissionsTitle)),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              children: [
                for (final e in labels.entries)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(end: 8),
                    child: ChoiceChip(
                      label: Text(e.value.$1),
                      selected: _status == e.key,
                      onSelected: (_) => setState(() => _status = e.key),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(hospitalBookingsProvider(_status)),
              child: AsyncValueView(
                value: bookings,
                onRetry: () => ref.invalidate(hospitalBookingsProvider(_status)),
                data: (page) {
                  final items = [...page.items]
                    ..sort((a, b) => (a.admissionDate ?? DateTime(2100)).compareTo(b.admissionDate ?? DateTime(2100)));
                  if (items.isEmpty) {
                    return ListView(
                      children: [EmptyView(title: labels[_status]!.$2, icon: Icons.bed_outlined)],
                    );
                  }
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    children: [for (final b in items) _AdmissionTile(booking: b)],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AdmissionTile extends StatelessWidget {
  const _AdmissionTile({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final days = b.admissionDate == null ? null : Dates.daysUntil(b.admissionDate!);
    final l10n = context.l10n;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      onTap: () => context.push(HospitalRoutes.booking(b.id)),
      child: Row(
        children: [
          Avatar(name: b.patient?.fullName ?? ''),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  b.patient?.fullName ?? l10n.hpPatientFallback,
                  style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                Text(
                  [
                    b.bookingNumber,
                    b.procedure?.name ?? '',
                    b.doctor?.fullName ?? '',
                  ].where((s) => s.isNotEmpty).join(' · '),
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
                const SizedBox(height: 2),
                Text(
                  b.status == BookingStatus.completed
                      ? l10n.hpTileDischarged(Dates.day(b.dischargeDate ?? b.completedAt))
                      : b.status == BookingStatus.admitted
                      ? l10n.hpTileAdmitted(Dates.day(b.admittedAt ?? b.admissionDate))
                      : '${l10n.hpTileAdmission(Dates.day(b.admissionDate))}'
                            '${days != null && days >= 0 ? ' · ${l10n.hpTileInDays(days)}' : ''}',
                  style: context.text.labelMedium,
                ),
              ],
            ),
          ),
          StatusBadge.forEnum(b.status, dense: true),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------- detail

/// Booking detail for the hospital: admit / discharge and the patient's itinerary.
class HospitalBookingDetailScreen extends ConsumerStatefulWidget {
  const HospitalBookingDetailScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  ConsumerState<HospitalBookingDetailScreen> createState() => _HospitalBookingDetailScreenState();
}

class _HospitalBookingDetailScreenState extends ConsumerState<HospitalBookingDetailScreen> {
  bool _busy = false;

  void _refresh() {
    ref
      ..invalidate(hospitalBookingProvider(widget.bookingId))
      ..invalidate(hospitalItineraryProvider(widget.bookingId))
      ..invalidate(hospitalBookingsProvider)
      ..invalidate(hospitalDashboardProvider);
  }

  Future<void> _guard(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    try {
      await action();
      _refresh();
      if (mounted) showInfoSnack(context, done);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _admit(Booking b) async {
    final l10n = context.l10n;
    final name = b.patient?.fullName;
    final note = await promptText(
      context,
      title: name == null ? l10n.hpAdmitPatientTitle : l10n.hpAdmitNamedTitle(name),
      label: l10n.hpNoteOptional,
      confirmLabel: l10n.hpAdmitButton,
    );
    if (note == null || !mounted) return;
    await _guard(() => ref.read(hospitalRepositoryProvider).admit(b.id, note: note), l10n.hpPatientAdmitted);
  }

  Future<void> _discharge(Booking b) async {
    final now = DateTime.now();
    final l10n = context.l10n;
    final date = await showDatePicker(
      context: context,
      helpText: l10n.hpDischargeDate,
      initialDate: now,
      firstDate: b.admittedAt ?? b.admissionDate ?? now.subtract(const Duration(days: 365)),
      lastDate: now,
    );
    if (date == null || !mounted) return;
    final note = await promptText(
      context,
      title: l10n.hpDischargeNoteTitle,
      label: l10n.hpNoteOptional,
      confirmLabel: l10n.hpDischargeButton,
    );
    if (note == null || !mounted) return;
    await _guard(
      () => ref.read(hospitalRepositoryProvider).discharge(b.id, note: note, dischargeDate: date),
      l10n.hpPatientDischarged,
    );
  }

  Future<void> _addItinerary(Booking b) async {
    final draft = await showModalBottomSheet<ItineraryDraft>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ItineraryForm(defaultLocation: b.hospital.name),
    );
    if (draft == null || !mounted) return;
    await _guard(() => ref.read(hospitalRepositoryProvider).addItinerary(b.id, draft), context.l10n.hpAddedToItinerary);
  }

  @override
  Widget build(BuildContext context) {
    final booking = ref.watch(hospitalBookingProvider(widget.bookingId));
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(booking.value?.bookingNumber ?? l10n.hpBookingFallbackTitle)),
      floatingActionButton: booking.value == null || !booking.value!.isActive
          ? null
          : FloatingActionButton.extended(
              heroTag: 'hospital-add-itinerary',
              onPressed: _busy ? null : () => _addItinerary(booking.value!),
              icon: const Icon(Icons.add_task_rounded),
              label: Text(l10n.hpItinerary),
            ),
      body: AsyncValueView(
        value: booking,
        onRetry: () => ref.invalidate(hospitalBookingProvider(widget.bookingId)),
        data: (b) => RefreshIndicator(
          onRefresh: () async => _refresh(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            b.patient?.fullName ?? l10n.hpPatientFallback,
                            style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                        StatusBadge.forEnum(b.status),
                      ],
                    ),
                    const SizedBox(height: 8),
                    InfoRow(l10n.hpInfoTreatment, b.procedure?.name ?? b.package?.name),
                    InfoRow(l10n.hpInfoDoctor, b.doctor?.fullName),
                    InfoRow(l10n.hpInfoAdmission, Dates.day(b.admissionDate)),
                    if (b.admittedAt != null) InfoRow(l10n.hpInfoAdmitted, Dates.dayTime(b.admittedAt)),
                    if (b.dischargeDate != null) InfoRow(l10n.hpInfoDischarge, Dates.day(b.dischargeDate)),
                    InfoRow(l10n.hpInfoLengthOfStay, b.durationDays == null ? null : l10n.hpDays(b.durationDays!)),
                    InfoRow(l10n.hpTotal, money(b.totalMinor, b.currency)),
                    InfoRow(l10n.hpInfoPaid, money(b.amountPaidMinor, b.currency)),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              if (b.status == BookingStatus.confirmed)
                PrimaryButton(
                  key: const ValueKey('hospital-admit'),
                  label: l10n.hpAdmitPatientButton,
                  icon: Icons.login_rounded,
                  tone: ButtonTone.violet,
                  loading: _busy,
                  onPressed: _busy ? null : () => _admit(b),
                ),
              if (b.status == BookingStatus.admitted)
                PrimaryButton(
                  key: const ValueKey('hospital-discharge'),
                  label: l10n.hpDischargePatientButton,
                  icon: Icons.logout_rounded,
                  loading: _busy,
                  onPressed: _busy ? null : () => _discharge(b),
                ),
              if (b.status == BookingStatus.pendingPayment)
                Text(l10n.hpAwaitingDeposit, style: context.text.bodySmall?.copyWith(color: AppColors.warning)),
              const SizedBox(height: 4),
              TextButton.icon(
                onPressed: () => context.push(HospitalRoutes.caseDetail(b.caseId)),
                icon: const Icon(Icons.folder_shared_outlined),
                label: Text(l10n.hpOpenCase),
              ),
              SectionTitle(l10n.hpItinerary),
              _ItineraryList(booking: b, busy: _busy, guard: _guard),
            ],
          ),
        ),
      ),
    );
  }
}

class _ItineraryList extends ConsumerWidget {
  const _ItineraryList({required this.booking, required this.busy, required this.guard});

  final Booking booking;
  final bool busy;
  final Future<void> Function(Future<void> Function() action, String done) guard;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.read(hospitalRepositoryProvider);
    final l10n = context.l10n;
    return AsyncValueView(
      value: ref.watch(hospitalItineraryProvider(booking.id)),
      compactError: true,
      onRetry: () => ref.invalidate(hospitalItineraryProvider(booking.id)),
      data: (items) {
        if (items.isEmpty) {
          return Text(
            l10n.hpNoItineraryYet,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          );
        }
        final sorted = [...items]
          ..sort((a, b) => (a.startsAt ?? DateTime(2100)).compareTo(b.startsAt ?? DateTime(2100)));
        return Column(
          children: [
            for (final it in sorted)
              AppCard(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsetsDirectional.fromSTEB(12, 8, 4, 8),
                child: Row(
                  children: [
                    Icon(_kindIcon(it.kind), color: AppColors.statusColor(it.status.json)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            it.title,
                            style: context.text.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              decoration: it.status == ItineraryItemStatus.cancelled
                                  ? TextDecoration.lineThrough
                                  : null,
                            ),
                          ),
                          Text(
                            [
                              it.kind.label,
                              Dates.dayTime(it.startsAt),
                              it.location ?? '',
                            ].where((s) => s.isNotEmpty).join(' · '),
                            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                          ),
                        ],
                      ),
                    ),
                    PopupMenuButton<String>(
                      enabled: !busy,
                      onSelected: (v) => switch (v) {
                        'done' => guard(
                          () => repo.setItineraryStatus(booking.id, it.id, ItineraryItemStatus.done),
                          l10n.hpItineraryMarkedDone,
                        ),
                        'cancel' => guard(
                          () => repo.setItineraryStatus(booking.id, it.id, ItineraryItemStatus.cancelled),
                          l10n.hpItineraryCancelled,
                        ),
                        _ => guard(() => repo.deleteItinerary(booking.id, it.id), l10n.hpItineraryRemoved),
                      },
                      itemBuilder: (_) => [
                        if (it.status != ItineraryItemStatus.done)
                          PopupMenuItem(value: 'done', child: Text(l10n.hpItineraryMarkDone)),
                        if (it.status == ItineraryItemStatus.scheduled)
                          PopupMenuItem(value: 'cancel', child: Text(l10n.commonCancel)),
                        PopupMenuItem(value: 'delete', child: Text(l10n.commonDelete)),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

IconData _kindIcon(ItineraryKind k) => switch (k) {
  ItineraryKind.appointment => Icons.medical_services_outlined,
  ItineraryKind.admission => Icons.login_rounded,
  ItineraryKind.surgery => Icons.healing_outlined,
  ItineraryKind.pickup => Icons.airport_shuttle_outlined,
  ItineraryKind.checkin => Icons.hotel_outlined,
  ItineraryKind.checkout => Icons.logout_rounded,
  ItineraryKind.followup => Icons.event_repeat_outlined,
  ItineraryKind.sightseeing => Icons.photo_camera_outlined,
  ItineraryKind.other => Icons.event_note_outlined,
};

class _ItineraryForm extends StatefulWidget {
  const _ItineraryForm({required this.defaultLocation});

  final String defaultLocation;

  @override
  State<_ItineraryForm> createState() => _ItineraryFormState();
}

class _ItineraryFormState extends State<_ItineraryForm> {
  ItineraryKind _kind = ItineraryKind.appointment;
  final _title = TextEditingController();
  late final _location = TextEditingController(text: widget.defaultLocation);
  final _description = TextEditingController();
  DateTime? _startsAt;

  @override
  void dispose() {
    _title.dispose();
    _location.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickWhen() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _startsAt ?? now,
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (d == null || !mounted) return;
    final t = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 9, minute: 0));
    if (!mounted) return;
    setState(() => _startsAt = DateTime(d.year, d.month, d.day, t?.hour ?? 9, t?.minute ?? 0));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.hpAddToItinerary, style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          DropdownButtonFormField<ItineraryKind>(
            initialValue: _kind,
            decoration: InputDecoration(labelText: l10n.hpItineraryTypeLabel),
            items: [for (final k in ItineraryKind.values) DropdownMenuItem(value: k, child: Text(k.label))],
            onChanged: (v) => setState(() => _kind = v ?? _kind),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('itinerary-title'),
            controller: _title,
            decoration: InputDecoration(labelText: l10n.hpItineraryTitleLabel),
          ),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.schedule_rounded),
            title: Text(_startsAt == null ? l10n.hpItineraryDateTime : Dates.dayTime(_startsAt)),
            onTap: _pickWhen,
          ),
          TextField(
            controller: _location,
            decoration: InputDecoration(labelText: l10n.hpItineraryLocationLabel),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            maxLines: 2,
            decoration: InputDecoration(labelText: l10n.hpItineraryInstructionsLabel),
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            label: l10n.commonAdd,
            onPressed: () {
              if (_title.text.trim().isEmpty) return;
              Navigator.of(context).pop(
                ItineraryDraft(
                  kind: _kind,
                  title: _title.text,
                  startsAt: _startsAt,
                  location: _location.text,
                  description: _description.text,
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------------------------ itineraries

/// Patients whose itinerary the hospital manages (confirmed + admitted bookings).
class ItinerariesScreen extends ConsumerWidget {
  const ItinerariesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final upcoming = ref.watch(hospitalBookingsProvider(BookingStatus.confirmed));
    final admitted = ref.watch(hospitalBookingsProvider(BookingStatus.admitted));
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.hpItineraries)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(hospitalBookingsProvider),
        child: ListView(
          padding: AppSpacing.pageAll,
          children: [
            SectionTitle(l10n.hpKpiInTreatment, padding: const EdgeInsets.only(bottom: 10)),
            AsyncValueView(
              value: admitted,
              compactError: true,
              onRetry: () => ref.invalidate(hospitalBookingsProvider(BookingStatus.admitted)),
              data: (p) => p.items.isEmpty
                  ? Text(l10n.hpNobodyAdmitted, style: context.text.bodySmall)
                  : Column(children: [for (final b in p.items) _AdmissionTile(booking: b)]),
            ),
            SectionTitle(l10n.hpUpcomingArrivals),
            AsyncValueView(
              value: upcoming,
              compactError: true,
              onRetry: () => ref.invalidate(hospitalBookingsProvider(BookingStatus.confirmed)),
              data: (p) => p.items.isEmpty
                  ? Text(l10n.hpNoConfirmedBookings, style: context.text.bodySmall)
                  : Column(children: [for (final b in p.items) _AdmissionTile(booking: b)]),
            ),
          ],
        ),
      ),
    );
  }
}
