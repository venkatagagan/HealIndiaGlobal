import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/travel_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../providers/travel_providers.dart';

/// Shared bottom-sheet frame for travel requests.
Future<bool?> _showRequestSheet(BuildContext context, Widget child) => showModalBottomSheet<bool>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (ctx) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
    child: SafeArea(child: child),
  ),
);

/// `POST /travel/visa-requests` (e-Medical / e-Medical Attendant visa assistance).
Future<bool?> showVisaRequestSheet(BuildContext context, {required String caseId}) =>
    _showRequestSheet(context, _VisaRequestForm(caseId: caseId));

/// `POST /travel/travel-bookings` for a flight, airport pickup / drop or local transport.
Future<bool?> showTravelRequestSheet(
  BuildContext context, {
  required String caseId,
  required TravelKind kind,
  String? destinationCity,
}) => _showRequestSheet(context, _TravelRequestForm(caseId: caseId, kind: kind, destinationCity: destinationCity));

/// `POST /travel/accommodation-bookings` with a provider linked to the hospital.
Future<bool?> showAccommodationRequestSheet(
  BuildContext context, {
  required String caseId,
  String? hospitalId,
  DateTime? checkIn,
  DateTime? checkOut,
}) => _showRequestSheet(
  context,
  _AccommodationRequestForm(caseId: caseId, hospitalId: hospitalId, checkIn: checkIn, checkOut: checkOut),
);

/// `POST /travel/service-bookings` (translator, local guide, transport).
Future<bool?> showServiceRequestSheet(
  BuildContext context, {
  required String caseId,
  required ServiceKind kind,
  String? city,
}) => _showRequestSheet(context, _ServiceRequestForm(caseId: caseId, kind: kind, city: city));

class _SheetFrame extends StatelessWidget {
  const _SheetFrame({
    required this.title,
    required this.subtitle,
    required this.children,
    required this.submitLabel,
    required this.onSubmit,
    required this.busy,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;
  final String submitLabel;
  final VoidCallback? onSubmit;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return ListView(
      shrinkWrap: true,
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      children: [
        Text(title, style: context.text.titleLarge),
        const SizedBox(height: 4),
        Text(subtitle, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
        const SizedBox(height: 16),
        ...children,
        const SizedBox(height: 20),
        PrimaryButton(label: submitLabel, tone: ButtonTone.violet, loading: busy, onPressed: onSubmit),
      ],
    );
  }
}

/// Tappable read-only field showing a picked date / time.
class _PickerField extends StatelessWidget {
  const _PickerField({required this.label, required this.value, required this.onTap, this.icon = Icons.event_rounded});

  final String label;
  final String? value;
  final VoidCallback onTap;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: InputDecorator(
          decoration: InputDecoration(labelText: label, suffixIcon: Icon(icon)),
          child: Text(
            value ?? context.l10n.travelSelect,
            style: value == null ? TextStyle(color: context.palette.textMuted) : null,
          ),
        ),
      ),
    );
  }
}

Future<DateTime?> _pickDate(BuildContext context, {DateTime? initial}) {
  final today = Dates.dateOnly(DateTime.now());
  return showDatePicker(
    context: context,
    initialDate: initial ?? today.add(const Duration(days: 1)),
    firstDate: today,
    lastDate: DateTime(today.year + 2, today.month, today.day),
  );
}

Future<DateTime?> _pickDateTime(BuildContext context, {DateTime? initial}) async {
  final date = await _pickDate(context, initial: initial);
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(
    context: context,
    initialTime: initial == null ? const TimeOfDay(hour: 10, minute: 0) : TimeOfDay.fromDateTime(initial),
  );
  if (time == null) return DateTime(date.year, date.month, date.day, 10);
  return DateTime(date.year, date.month, date.day, time.hour, time.minute);
}

// ---------------------------------------------------------------------------------------- visa

class _VisaRequestForm extends ConsumerStatefulWidget {
  const _VisaRequestForm({required this.caseId});

  final String caseId;

  @override
  ConsumerState<_VisaRequestForm> createState() => _VisaRequestFormState();
}

class _VisaRequestFormState extends ConsumerState<_VisaRequestForm> {
  VisaType _type = VisaType.eMedical;
  final _notes = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return _SheetFrame(
      title: l10n.visaAssistanceTitle,
      subtitle: l10n.visaAssistanceSubtitle,
      submitLabel: l10n.visaRequestAssistance,
      busy: _busy,
      onSubmit: _submit,
      children: [
        SegmentedButton<VisaType>(
          segments: [
            ButtonSegment(
              value: VisaType.eMedical,
              label: Text(l10n.visaForPatient),
              icon: const Icon(Icons.person_rounded),
            ),
            ButtonSegment(
              value: VisaType.eMedicalAttendant,
              label: Text(l10n.visaForAttendant),
              icon: const Icon(Icons.people_alt_rounded),
            ),
          ],
          selected: {_type},
          onSelectionChanged: (s) => setState(() => _type = s.first),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _notes,
          maxLines: 3,
          maxLength: 2000,
          decoration: InputDecoration(labelText: l10n.visaNotesLabel),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(travelRepositoryProvider)
          .createVisaRequest(caseId: widget.caseId, visaType: _type, notes: _notes.text.trim());
      ref.invalidate(visaRequestsProvider);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

// -------------------------------------------------------------------------------------- travel

class _TravelRequestForm extends ConsumerStatefulWidget {
  const _TravelRequestForm({required this.caseId, required this.kind, this.destinationCity});

  final String caseId;
  final TravelKind kind;
  final String? destinationCity;

  @override
  ConsumerState<_TravelRequestForm> createState() => _TravelRequestFormState();
}

class _TravelRequestFormState extends ConsumerState<_TravelRequestForm> {
  final _from = TextEditingController();
  final _to = TextEditingController();
  final _flight = TextEditingController();
  final _notes = TextEditingController();
  DateTime? _when;
  int _passengers = 1;
  bool _busy = false;
  bool _prefilled = false;

  bool get _isFlight => widget.kind == TravelKind.flight;
  bool get _isPickup => widget.kind == TravelKind.airportPickup;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_prefilled) return;
    _prefilled = true;
    final l10n = context.l10n;
    final city = widget.destinationCity ?? '';
    final airport = city.isEmpty ? l10n.travelAirport : l10n.travelCityAirport(city);
    switch (widget.kind) {
      case TravelKind.flight:
        _to.text = city;
      case TravelKind.airportPickup:
        _from.text = airport;
        _to.text = l10n.travelHospitalOrHotel;
      case TravelKind.airportDrop:
        _from.text = l10n.travelHospitalOrHotel;
        _to.text = airport;
      case TravelKind.localTransport:
        break;
    }
  }

  @override
  void dispose() {
    for (final c in [_from, _to, _flight, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (title, subtitle, whenLabel) = switch (widget.kind) {
      TravelKind.flight => (l10n.flightRequestTitle, l10n.flightRequestSubtitle, l10n.flightPreferredDeparture),
      TravelKind.airportPickup => (l10n.travelAirportPickup, l10n.travelPickupSubtitle, l10n.travelArrivalDateTime),
      TravelKind.airportDrop => (l10n.travelAirportDrop, l10n.travelDropSubtitle, l10n.travelPickupTime),
      TravelKind.localTransport => (l10n.travelLocalTransport, l10n.travelLocalTransportSubtitle, l10n.travelStart),
    };
    return _SheetFrame(
      title: title,
      subtitle: subtitle,
      submitLabel: l10n.travelSendRequest,
      busy: _busy,
      onSubmit: _when == null ? null : _submit,
      children: [
        TextField(
          controller: _from,
          decoration: InputDecoration(labelText: _isFlight ? l10n.flightFromCityOrAirport : l10n.travelFrom),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _to,
          decoration: InputDecoration(labelText: l10n.travelTo),
        ),
        const SizedBox(height: 12),
        _PickerField(
          label: whenLabel,
          value: _when == null ? null : (_isFlight ? Dates.day(_when) : Dates.dayTime(_when)),
          icon: _isFlight ? Icons.event_rounded : Icons.schedule_rounded,
          onTap: () async {
            final picked = _isFlight
                ? await _pickDate(context, initial: _when)
                : await _pickDateTime(context, initial: _when);
            if (picked != null) setState(() => _when = picked);
          },
        ),
        if (_isPickup || widget.kind == TravelKind.airportDrop) ...[
          TextField(
            controller: _flight,
            maxLength: 20,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(labelText: l10n.flightNumberOptional, counterText: ''),
          ),
          const SizedBox(height: 12),
        ],
        Row(
          children: [
            Expanded(child: Text(l10n.travelPassengers, style: context.text.bodyLarge)),
            IconButton(
              tooltip: l10n.travelFewerPassengers,
              onPressed: _passengers > 1 ? () => setState(() => _passengers--) : null,
              icon: const Icon(Icons.remove_circle_outline_rounded),
            ),
            Text('$_passengers', style: context.text.titleMedium),
            IconButton(
              tooltip: l10n.travelMorePassengers,
              onPressed: _passengers < 20 ? () => setState(() => _passengers++) : null,
              icon: const Icon(Icons.add_circle_outline_rounded),
            ),
          ],
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _notes,
          maxLines: 2,
          maxLength: 2000,
          decoration: InputDecoration(labelText: l10n.travelNotesLabel),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(travelRepositoryProvider)
          .createTravelBooking(
            caseId: widget.caseId,
            kind: widget.kind,
            fromLocation: _from.text.trim(),
            toLocation: _to.text.trim(),
            departAt: _isPickup ? null : _when,
            arriveAt: _isPickup ? _when : null,
            flightNumber: _flight.text.trim(),
            passengers: _passengers,
            notes: _notes.text.trim(),
          );
      ref.invalidate(travelBookingsProvider);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

// ------------------------------------------------------------------------------- accommodation

class _AccommodationRequestForm extends ConsumerStatefulWidget {
  const _AccommodationRequestForm({required this.caseId, this.hospitalId, this.checkIn, this.checkOut});

  final String caseId;
  final String? hospitalId;
  final DateTime? checkIn;
  final DateTime? checkOut;

  @override
  ConsumerState<_AccommodationRequestForm> createState() => _AccommodationRequestFormState();
}

class _AccommodationRequestFormState extends ConsumerState<_AccommodationRequestForm> {
  String? _providerId;
  DateTimeRange? _range;
  int _guests = 1;
  final _notes = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final inDate = widget.checkIn;
    final outDate = widget.checkOut;
    if (inDate != null && outDate != null && outDate.isAfter(inDate)) {
      _range = DateTimeRange(start: inDate, end: outDate);
    }
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final options = ref.watch(accommodationOptionsProvider(widget.hospitalId));
    final l10n = context.l10n;
    return _SheetFrame(
      title: l10n.stayRequestAccommodation,
      subtitle: l10n.staySheetSubtitle,
      submitLabel: l10n.travelSendRequest,
      busy: _busy,
      onSubmit: _providerId == null || _range == null ? null : _submit,
      children: [
        options.when(
          loading: () => const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator()),
          error: (e, _) => ErrorView(
            error: e,
            compact: true,
            onRetry: () => ref.invalidate(accommodationOptionsProvider(widget.hospitalId)),
          ),
          data: (list) => list.isEmpty
              ? Text(l10n.stayNoPartners, style: context.text.bodyMedium)
              : Column(
                  children: [
                    for (final p in list)
                      AppCard(
                        margin: const EdgeInsets.only(bottom: 8),
                        selected: _providerId == p.id,
                        selectedColor: AppColors.violet,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        onTap: () => setState(() => _providerId = p.id),
                        child: Row(
                          children: [
                            Icon(
                              p.type == AccommodationType.hospitalGuestRoom
                                  ? Icons.local_hospital_rounded
                                  : Icons.hotel_rounded,
                              color: AppColors.violet,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(p.name, style: context.text.titleSmall),
                                  Text(
                                    [
                                      p.type.label,
                                      if (p.starRating != null) '${p.starRating!.toStringAsFixed(0)}★',
                                      if (p.distanceKm != null)
                                        l10n.stayDistanceKm(NumberFormat('0.0').format(p.distanceKm)),
                                    ].join(' · '),
                                    style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                                  ),
                                ],
                              ),
                            ),
                            if (p.nightlyRateMinor != null)
                              Text(
                                l10n.stayPerNight(formatMoney(p.nightlyRateMinor!, p.currency)),
                                style: context.text.labelMedium,
                              ),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 8),
        _PickerField(
          label: l10n.stayCheckInOut,
          value: _range == null ? null : '${Dates.day(_range!.start)} - ${Dates.day(_range!.end)}',
          onTap: () async {
            final today = Dates.dateOnly(DateTime.now());
            final picked = await showDateRangePicker(
              context: context,
              firstDate: today,
              lastDate: DateTime(today.year + 2, today.month, today.day),
              initialDateRange: _range,
            );
            if (picked != null && picked.end.isAfter(picked.start)) setState(() => _range = picked);
          },
        ),
        Row(
          children: [
            Expanded(child: Text(l10n.stayGuests, style: context.text.bodyLarge)),
            IconButton(
              tooltip: l10n.stayFewerGuests,
              onPressed: _guests > 1 ? () => setState(() => _guests--) : null,
              icon: const Icon(Icons.remove_circle_outline_rounded),
            ),
            Text('$_guests', style: context.text.titleMedium),
            IconButton(
              tooltip: l10n.stayMoreGuests,
              onPressed: _guests < 20 ? () => setState(() => _guests++) : null,
              icon: const Icon(Icons.add_circle_outline_rounded),
            ),
          ],
        ),
        TextField(
          controller: _notes,
          maxLines: 2,
          maxLength: 2000,
          decoration: InputDecoration(labelText: l10n.stayNotesLabel),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    final providerId = _providerId;
    final range = _range;
    if (providerId == null || range == null) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(travelRepositoryProvider)
          .createAccommodationBooking(
            caseId: widget.caseId,
            providerId: providerId,
            checkIn: range.start,
            checkOut: range.end,
            guests: _guests,
            notes: _notes.text.trim(),
          );
      ref.invalidate(accommodationBookingsProvider);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

// ------------------------------------------------------------------------------------ services

class _ServiceRequestForm extends ConsumerStatefulWidget {
  const _ServiceRequestForm({required this.caseId, required this.kind, this.city});

  final String caseId;
  final ServiceKind kind;
  final String? city;

  @override
  ConsumerState<_ServiceRequestForm> createState() => _ServiceRequestFormState();
}

class _ServiceRequestFormState extends ConsumerState<_ServiceRequestForm> {
  String? _providerId;
  DateTime? _start;
  final _notes = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final options = ref.watch(serviceProviderOptionsProvider((kind: widget.kind, city: widget.city)));
    final l10n = context.l10n;
    final (title, subtitle, notesHint) = switch (widget.kind) {
      ServiceKind.translator => (l10n.travelTranslatorTitle, l10n.travelTranslatorSubtitle, l10n.travelTranslatorNotes),
      ServiceKind.localGuide => (l10n.travelGuideTitle, l10n.travelGuideSubtitle, l10n.travelGuideNotes),
      _ => (
        l10n.travelServiceRequestTitle(widget.kind.label.toLowerCase()),
        l10n.travelServiceSubtitle,
        l10n.travelNotes,
      ),
    };
    final providers = options.value ?? const <LocalServiceProvider>[];
    return _SheetFrame(
      title: title,
      subtitle: subtitle,
      submitLabel: l10n.travelSendRequest,
      busy: _busy,
      onSubmit: _submit,
      children: [
        _PickerField(
          label: l10n.travelWhenNeeded,
          value: _start == null ? null : Dates.dayTime(_start),
          icon: Icons.schedule_rounded,
          onTap: () async {
            final picked = await _pickDateTime(context, initial: _start);
            if (picked != null) setState(() => _start = picked);
          },
        ),
        if (options.isLoading) const LinearProgressIndicator(),
        if (providers.isNotEmpty) ...[
          Text(l10n.travelPreferredProvider, style: context.text.labelLarge),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ChipToggle(
                label: l10n.travelAnyAvailable,
                selected: _providerId == null,
                selectedColor: AppColors.violet,
                onChanged: (_) => setState(() => _providerId = null),
              ),
              for (final p in providers)
                ChipToggle(
                  label: p.languages.isEmpty ? p.name : '${p.name} (${p.languages.take(2).join(', ')})',
                  selected: _providerId == p.id,
                  selectedColor: AppColors.violet,
                  onChanged: (_) => setState(() => _providerId = p.id),
                ),
            ],
          ),
          const SizedBox(height: 12),
        ],
        TextField(
          controller: _notes,
          maxLines: 2,
          maxLength: 2000,
          decoration: InputDecoration(labelText: notesHint),
        ),
      ],
    );
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(travelRepositoryProvider)
          .createServiceBooking(
            caseId: widget.caseId,
            kind: widget.kind,
            providerId: _providerId,
            startsAt: _start,
            notes: _notes.text.trim(),
          );
      ref.invalidate(serviceBookingsProvider);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
