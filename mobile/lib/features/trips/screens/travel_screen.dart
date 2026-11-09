import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/repositories/travel_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../services/file_actions.dart';
import '../widgets/travel_request_sheets.dart';

/// Visa & travel for one case: visa status, flights and airport transfers, accommodation and local
/// services (translator / guide), each with "request" actions. Pushed from the Trips tab and case
/// detail with `Navigator`.
class TravelScreen extends ConsumerWidget {
  const TravelScreen({
    super.key,
    required this.caseId,
    this.hospitalId,
    this.hospitalCity,
    this.admissionDate,
    this.dischargeDate,
  });

  final String caseId;
  final String? hospitalId;
  final String? hospitalCity;
  final DateTime? admissionDate;
  final DateTime? dischargeDate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final visas = ref.watch(visaRequestsProvider(caseId));
    final travel = ref.watch(travelBookingsProvider(caseId));
    final stays = ref.watch(accommodationBookingsProvider(caseId));
    final services = ref.watch(serviceBookingsProvider(caseId));

    Future<void> refresh() async {
      ref
        ..invalidate(visaRequestsProvider(caseId))
        ..invalidate(travelBookingsProvider(caseId))
        ..invalidate(accommodationBookingsProvider(caseId))
        ..invalidate(serviceBookingsProvider(caseId));
    }

    void done(bool? ok) {
      if (ok == true && context.mounted) showInfoSnack(context, 'Request sent. Our travel desk will get back to you.');
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Visa & Travel'), centerTitle: true),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            const SectionTitle('Medical visa', padding: EdgeInsets.only(top: 8, bottom: 10)),
            _section<List<VisaRequest>>(
              context,
              visas,
              onRetry: () => ref.invalidate(visaRequestsProvider(caseId)),
              builder: (list) => list.isEmpty
                  ? _EmptyRequest(
                      icon: Icons.assignment_ind_outlined,
                      text:
                          'Most international patients need an Indian e-Medical visa. We provide the hospital '
                          'invitation letter and help you apply.',
                      action: 'Request visa assistance',
                      onAction: () async => done(await showVisaRequestSheet(context, caseId: caseId)),
                    )
                  : Column(children: [for (final v in list) _VisaCard(visa: v)]),
            ),
            const SectionTitle('Flights & airport transfers'),
            _section<List<TravelBooking>>(
              context,
              travel,
              onRetry: () => ref.invalidate(travelBookingsProvider(caseId)),
              builder: (list) => Column(
                children: [
                  for (final t in list) _TravelTile(booking: t),
                  if (list.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        'No flight or transfer requests yet.',
                        style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
                      ),
                    ),
                ],
              ),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _RequestChip(
                  icon: Icons.flight_rounded,
                  label: 'Request flight',
                  onTap: () async => done(
                    await showTravelRequestSheet(
                      context,
                      caseId: caseId,
                      kind: TravelKind.flight,
                      destinationCity: hospitalCity,
                    ),
                  ),
                ),
                _RequestChip(
                  icon: Icons.airport_shuttle_rounded,
                  label: 'Airport pickup',
                  onTap: () async => done(
                    await showTravelRequestSheet(
                      context,
                      caseId: caseId,
                      kind: TravelKind.airportPickup,
                      destinationCity: hospitalCity,
                    ),
                  ),
                ),
                _RequestChip(
                  icon: Icons.flight_takeoff_rounded,
                  label: 'Airport drop',
                  onTap: () async => done(
                    await showTravelRequestSheet(
                      context,
                      caseId: caseId,
                      kind: TravelKind.airportDrop,
                      destinationCity: hospitalCity,
                    ),
                  ),
                ),
              ],
            ),
            const SectionTitle('Accommodation'),
            _section<List<AccommodationBooking>>(
              context,
              stays,
              onRetry: () => ref.invalidate(accommodationBookingsProvider(caseId)),
              builder: (list) => list.isEmpty
                  ? _EmptyRequest(
                      icon: Icons.hotel_outlined,
                      text: 'Hotels, guest houses and service apartments close to your hospital.',
                      action: 'Request accommodation',
                      onAction: () async => done(
                        await showAccommodationRequestSheet(
                          context,
                          caseId: caseId,
                          hospitalId: hospitalId,
                          checkIn: admissionDate?.subtract(const Duration(days: 1)),
                          checkOut: dischargeDate?.add(const Duration(days: 3)),
                        ),
                      ),
                    )
                  : Column(
                      children: [
                        for (final s in list) _StayTile(stay: s),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            icon: const Icon(Icons.add_rounded),
                            label: const Text('Request another stay'),
                            onPressed: () async => done(
                              await showAccommodationRequestSheet(context, caseId: caseId, hospitalId: hospitalId),
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
            const SectionTitle('Local services'),
            _section<List<ServiceBooking>>(
              context,
              services,
              onRetry: () => ref.invalidate(serviceBookingsProvider(caseId)),
              builder: (list) => Column(children: [for (final s in list) _ServiceTile(service: s)]),
            ),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _RequestChip(
                  icon: Icons.translate_rounded,
                  label: 'Translator',
                  onTap: () async => done(
                    await showServiceRequestSheet(
                      context,
                      caseId: caseId,
                      kind: ServiceKind.translator,
                      city: hospitalCity,
                    ),
                  ),
                ),
                _RequestChip(
                  icon: Icons.map_rounded,
                  label: 'Local guide',
                  onTap: () async => done(
                    await showServiceRequestSheet(
                      context,
                      caseId: caseId,
                      kind: ServiceKind.localGuide,
                      city: hospitalCity,
                    ),
                  ),
                ),
                _RequestChip(
                  icon: Icons.directions_car_rounded,
                  label: 'Transport',
                  onTap: () async => done(
                    await showServiceRequestSheet(
                      context,
                      caseId: caseId,
                      kind: ServiceKind.transport,
                      city: hospitalCity,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _section<T>(
    BuildContext context,
    AsyncValue<T> value, {
    required Widget Function(T) builder,
    required VoidCallback onRetry,
  }) {
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => ErrorView(error: e, compact: true, onRetry: onRetry),
      data: builder,
    );
  }
}

class _RequestChip extends StatelessWidget {
  const _RequestChip({required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ActionChip(
    avatar: Icon(icon, size: 18, color: AppColors.violet),
    label: Text(label),
    onPressed: onTap,
  );
}

class _EmptyRequest extends StatelessWidget {
  const _EmptyRequest({required this.icon, required this.text, required this.action, required this.onAction});

  final IconData icon;
  final String text;
  final String action;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: AppColors.violet),
              const SizedBox(width: 12),
              Expanded(child: Text(text, style: context.text.bodyMedium)),
            ],
          ),
          const SizedBox(height: 12),
          SecondaryButton(label: action, onPressed: onAction, borderColor: AppColors.violet),
        ],
      ),
    );
  }
}

class _VisaCard extends ConsumerWidget {
  const _VisaCard({required this.visa});

  final VisaRequest visa;

  static const _steps = [
    VisaStatus.notStarted,
    VisaStatus.documentsPending,
    VisaStatus.invitationIssued,
    VisaStatus.applied,
    VisaStatus.approved,
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rejected = visa.status == VisaStatus.rejected;
    final current = rejected ? _steps.length - 1 : _steps.indexOf(visa.status);
    final letterId = visa.invitationLetterDocumentId;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(visa.visaType.label, style: context.text.titleSmall)),
              StatusBadge.forEnum(visa.status),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (var i = 0; i < _steps.length; i++) ...[
                Expanded(
                  child: Container(
                    height: 6,
                    decoration: BoxDecoration(
                      color: rejected && i == current
                          ? AppColors.danger
                          : (i <= current ? AppColors.violet : context.palette.surfaceAlt),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
                ),
                if (i < _steps.length - 1) const SizedBox(width: 4),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text(_hint(visa.status), style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
          if (visa.applicationReference != null) ...[
            const SizedBox(height: 4),
            Text('Application ref: ${visa.applicationReference}', style: context.text.bodySmall),
          ],
          if (letterId != null)
            TextButton.icon(
              icon: const Icon(Icons.mark_email_read_outlined),
              label: const Text('Invitation letter'),
              onPressed: () async {
                final repo = ref.read(documentRepositoryProvider);
                try {
                  final doc = await repo.get(letterId);
                  if (context.mounted) await openDocument(context, repo, doc);
                } catch (e) {
                  if (context.mounted) showErrorSnack(context, e);
                }
              },
            ),
        ],
      ),
    );
  }

  static String _hint(VisaStatus s) => switch (s) {
    VisaStatus.notStarted => 'We have your request and will list the documents you need.',
    VisaStatus.documentsPending => 'Upload your passport and medical reports in Documents.',
    VisaStatus.invitationIssued => 'Your invitation letter is ready. Apply at indianvisaonline.gov.in.',
    VisaStatus.applied => 'Application submitted. Decisions usually take 3-5 working days.',
    VisaStatus.approved => 'Visa approved. Carry a printed copy when you travel.',
    VisaStatus.rejected => 'The application was not approved. Your coordinator will contact you.',
  };
}

class _TravelTile extends StatelessWidget {
  const _TravelTile({required this.booking});

  final TravelBooking booking;

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final icon = switch (b.kind) {
      TravelKind.flight => Icons.flight_rounded,
      TravelKind.airportPickup => Icons.airport_shuttle_rounded,
      TravelKind.airportDrop => Icons.flight_takeoff_rounded,
      TravelKind.localTransport => Icons.directions_car_rounded,
    };
    final when = b.departAt ?? b.arriveAt;
    final route = [b.fromLocation, b.toLocation].whereType<String>().where((s) => s.isNotEmpty).join(' → ');
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon, color: AppColors.violet),
        title: Text(b.kind.label),
        subtitle: Text(
          [
            if (route.isNotEmpty) route,
            if (when != null) Dates.dayTime(when),
            if (b.flightNumber != null) b.flightNumber!,
            if (b.pnr != null) 'PNR ${b.pnr}',
          ].join('\n'),
        ),
        isThreeLine: route.isNotEmpty && when != null,
        trailing: StatusBadge.forEnum(b.status, dense: true),
      ),
    );
  }
}

class _StayTile extends StatelessWidget {
  const _StayTile({required this.stay});

  final AccommodationBooking stay;

  @override
  Widget build(BuildContext context) {
    final s = stay;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const Icon(Icons.hotel_rounded, color: AppColors.violet),
        title: Text(s.providerName ?? 'Accommodation'),
        subtitle: Text(
          [
            if (s.checkIn != null && s.checkOut != null) '${Dates.dayShort(s.checkIn)} - ${Dates.day(s.checkOut)}',
            '${s.guests} ${s.guests == 1 ? 'guest' : 'guests'}',
            if (s.confirmationCode != null) 'Conf. ${s.confirmationCode}',
          ].join(' · '),
        ),
        trailing: StatusBadge.forEnum(s.status, dense: true),
      ),
    );
  }
}

class _ServiceTile extends StatelessWidget {
  const _ServiceTile({required this.service});

  final ServiceBooking service;

  @override
  Widget build(BuildContext context) {
    final s = service;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(
          s.kind == ServiceKind.translator ? Icons.translate_rounded : Icons.map_rounded,
          color: AppColors.violet,
        ),
        title: Text(s.providerName == null ? s.kind.label : '${s.kind.label} · ${s.providerName}'),
        subtitle: s.startsAt == null ? null : Text(Dates.dayTime(s.startsAt)),
        trailing: StatusBadge.forEnum(s.status, dense: true),
      ),
    );
  }
}
