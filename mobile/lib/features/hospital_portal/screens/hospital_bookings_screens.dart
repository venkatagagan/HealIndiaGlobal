import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
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

  static const _labels = {
    BookingStatus.confirmed: 'Upcoming',
    BookingStatus.admitted: 'In treatment',
    BookingStatus.completed: 'Discharged',
    BookingStatus.pendingPayment: 'Awaiting payment',
    BookingStatus.cancelled: 'Cancelled',
  };

  @override
  Widget build(BuildContext context) {
    final bookings = ref.watch(hospitalBookingsProvider(_status));
    return Scaffold(
      appBar: AppBar(title: const Text('Admissions')),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              children: [
                for (final e in _labels.entries)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(e.value),
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
                      children: [
                        EmptyView(title: 'No ${_labels[_status]!.toLowerCase()} patients', icon: Icons.bed_outlined),
                      ],
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
                  b.patient?.fullName ?? 'Patient',
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
                      ? 'Discharged ${Dates.day(b.dischargeDate ?? b.completedAt)}'
                      : b.status == BookingStatus.admitted
                      ? 'Admitted ${Dates.day(b.admittedAt ?? b.admissionDate)}'
                      : 'Admission ${Dates.day(b.admissionDate)}${days != null && days >= 0 ? ' · in $days day${days == 1 ? '' : 's'}' : ''}',
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
    final note = await promptText(
      context,
      title: 'Admit ${b.patient?.fullName ?? 'patient'}?',
      label: 'Note (optional)',
      confirmLabel: 'Admit',
    );
    if (note == null || !mounted) return;
    await _guard(() => ref.read(hospitalRepositoryProvider).admit(b.id, note: note), 'Patient admitted');
  }

  Future<void> _discharge(Booking b) async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      helpText: 'Discharge date',
      initialDate: now,
      firstDate: b.admittedAt ?? b.admissionDate ?? now.subtract(const Duration(days: 365)),
      lastDate: now,
    );
    if (date == null || !mounted) return;
    final note = await promptText(
      context,
      title: 'Discharge summary note',
      label: 'Note (optional)',
      confirmLabel: 'Discharge',
    );
    if (note == null || !mounted) return;
    await _guard(
      () => ref.read(hospitalRepositoryProvider).discharge(b.id, note: note, dischargeDate: date),
      'Patient discharged',
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
    await _guard(() => ref.read(hospitalRepositoryProvider).addItinerary(b.id, draft), 'Added to itinerary');
  }

  @override
  Widget build(BuildContext context) {
    final booking = ref.watch(hospitalBookingProvider(widget.bookingId));
    return Scaffold(
      appBar: AppBar(title: Text(booking.value?.bookingNumber ?? 'Booking')),
      floatingActionButton: booking.value == null || !booking.value!.isActive
          ? null
          : FloatingActionButton.extended(
              heroTag: 'hospital-add-itinerary',
              onPressed: _busy ? null : () => _addItinerary(booking.value!),
              icon: const Icon(Icons.add_task_rounded),
              label: const Text('Itinerary'),
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
                            b.patient?.fullName ?? 'Patient',
                            style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                          ),
                        ),
                        StatusBadge.forEnum(b.status),
                      ],
                    ),
                    const SizedBox(height: 8),
                    InfoRow('Treatment', b.procedure?.name ?? b.package?.name),
                    InfoRow('Doctor', b.doctor?.fullName),
                    InfoRow('Admission', Dates.day(b.admissionDate)),
                    if (b.admittedAt != null) InfoRow('Admitted', Dates.dayTime(b.admittedAt)),
                    if (b.dischargeDate != null) InfoRow('Discharge', Dates.day(b.dischargeDate)),
                    InfoRow('Length of stay', b.durationDays == null ? null : '${b.durationDays} days'),
                    InfoRow('Total', money(b.totalMinor, b.currency)),
                    InfoRow('Paid', money(b.amountPaidMinor, b.currency)),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              if (b.status == BookingStatus.confirmed)
                PrimaryButton(
                  key: const ValueKey('hospital-admit'),
                  label: 'Admit patient',
                  icon: Icons.login_rounded,
                  tone: ButtonTone.violet,
                  loading: _busy,
                  onPressed: _busy ? null : () => _admit(b),
                ),
              if (b.status == BookingStatus.admitted)
                PrimaryButton(
                  key: const ValueKey('hospital-discharge'),
                  label: 'Discharge patient',
                  icon: Icons.logout_rounded,
                  loading: _busy,
                  onPressed: _busy ? null : () => _discharge(b),
                ),
              if (b.status == BookingStatus.pendingPayment)
                Text(
                  'Awaiting the patient deposit. Admission opens once the booking is confirmed.',
                  style: context.text.bodySmall?.copyWith(color: AppColors.warning),
                ),
              const SizedBox(height: 4),
              TextButton.icon(
                onPressed: () => context.push(HospitalRoutes.caseDetail(b.caseId)),
                icon: const Icon(Icons.folder_shared_outlined),
                label: const Text('Open case'),
              ),
              const SectionTitle('Itinerary'),
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
    return AsyncValueView(
      value: ref.watch(hospitalItineraryProvider(booking.id)),
      compactError: true,
      onRetry: () => ref.invalidate(hospitalItineraryProvider(booking.id)),
      data: (items) {
        if (items.isEmpty) {
          return Text(
            'No itinerary yet — add appointments, the surgery slot, pickup and follow-ups.',
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
                padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
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
                          'Marked done',
                        ),
                        'cancel' => guard(
                          () => repo.setItineraryStatus(booking.id, it.id, ItineraryItemStatus.cancelled),
                          'Cancelled',
                        ),
                        _ => guard(() => repo.deleteItinerary(booking.id, it.id), 'Removed'),
                      },
                      itemBuilder: (_) => [
                        if (it.status != ItineraryItemStatus.done)
                          const PopupMenuItem(value: 'done', child: Text('Mark done')),
                        if (it.status == ItineraryItemStatus.scheduled)
                          const PopupMenuItem(value: 'cancel', child: Text('Cancel')),
                        const PopupMenuItem(value: 'delete', child: Text('Delete')),
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
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Add to itinerary', style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          DropdownButtonFormField<ItineraryKind>(
            initialValue: _kind,
            decoration: const InputDecoration(labelText: 'Type'),
            items: [for (final k in ItineraryKind.values) DropdownMenuItem(value: k, child: Text(k.label))],
            onChanged: (v) => setState(() => _kind = v ?? _kind),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const ValueKey('itinerary-title'),
            controller: _title,
            decoration: const InputDecoration(labelText: 'Title (e.g. Pre-op consultation)'),
          ),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.schedule_rounded),
            title: Text(_startsAt == null ? 'Date & time' : Dates.dayTime(_startsAt)),
            onTap: _pickWhen,
          ),
          TextField(
            controller: _location,
            decoration: const InputDecoration(labelText: 'Location'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            maxLines: 2,
            decoration: const InputDecoration(labelText: 'Instructions for the patient (optional)'),
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            label: 'Add',
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
    return Scaffold(
      appBar: AppBar(title: const Text('Itineraries')),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(hospitalBookingsProvider),
        child: ListView(
          padding: AppSpacing.pageAll,
          children: [
            const SectionTitle('In treatment', padding: EdgeInsets.only(bottom: 10)),
            AsyncValueView(
              value: admitted,
              compactError: true,
              onRetry: () => ref.invalidate(hospitalBookingsProvider(BookingStatus.admitted)),
              data: (p) => p.items.isEmpty
                  ? Text('Nobody admitted right now.', style: context.text.bodySmall)
                  : Column(children: [for (final b in p.items) _AdmissionTile(booking: b)]),
            ),
            const SectionTitle('Upcoming arrivals'),
            AsyncValueView(
              value: upcoming,
              compactError: true,
              onRetry: () => ref.invalidate(hospitalBookingsProvider(BookingStatus.confirmed)),
              data: (p) => p.items.isEmpty
                  ? Text('No confirmed bookings.', style: context.text.bodySmall)
                  : Column(children: [for (final b in p.items) _AdmissionTile(booking: b)]),
            ),
          ],
        ),
      ),
    );
  }
}
