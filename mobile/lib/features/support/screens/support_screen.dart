import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/booking_repository.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/messaging_repository.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/repositories/travel_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../messages/logic/notification_routes.dart';
import '../../messages/widgets/notification_tile.dart';
import '../../trips/providers/travel_providers.dart';
import '../../trips/services/journey_actions.dart';
import '../../trips/widgets/travel_request_sheets.dart';
import '../widgets/cultural_tips_carousel.dart';
import '../widgets/sos_flow.dart';
import '../widgets/support_map.dart';

/// In-country support: OSM map (hospital / stay / itinerary pins, zoom + locate), today's schedule,
/// real-time notifications, cultural tips, and floating actions (24/7 helpline, translator, local
/// guide) plus SOS.
///
/// Route: `/support` · Owner: fl-journey.
class SupportScreen extends ConsumerStatefulWidget {
  const SupportScreen({super.key});

  @override
  ConsumerState<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends ConsumerState<SupportScreen> {
  LatLng? _myLocation;

  @override
  Widget build(BuildContext context) {
    final dashboard = ref.watch(patientDashboardProvider);
    final booking = dashboard.value?.nextBooking;
    final caseId = booking?.caseId;

    final hospital = booking == null ? null : ref.watch(hospitalDetailProvider(booking.hospital.id)).value;
    final itinerary = booking == null ? null : ref.watch(itineraryProvider(booking.id)).value;
    final stays = caseId == null ? null : ref.watch(accommodationBookingsProvider(caseId)).value;
    final stayOptions = booking == null ? null : ref.watch(accommodationOptionsProvider(booking.hospital.id)).value;

    final pins = <MapPin>[
      if (hospital?.lat != null && hospital?.lng != null)
        MapPin(point: LatLng(hospital!.lat!, hospital.lng!), kind: MapPinKind.hospital, label: hospital.name),
      for (final s in stays ?? const <AccommodationBooking>[])
        if (s.status != ServiceBookingStatus.cancelled)
          ...?stayOptions
              ?.where((o) => o.id == s.providerId && o.lat != null && o.lng != null)
              .map((o) => MapPin(point: LatLng(o.lat!, o.lng!), kind: MapPinKind.stay, label: o.name)),
      for (final i in itinerary ?? const <ItineraryItem>[])
        if (i.hasCoordinates && i.status != ItineraryItemStatus.cancelled)
          MapPin(point: LatLng(i.lat!, i.lng!), kind: MapPinKind.itinerary, label: i.title),
    ];

    final schedule = _schedule(itinerary, dashboard.value?.todaySchedule ?? const []);
    final l10n = context.l10n;

    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(patientDashboardProvider);
                ref.invalidate(notificationsProvider);
                ref.invalidate(culturalTipsProvider);
                if (booking != null) ref.invalidate(itineraryProvider(booking.id));
                await ref.read(patientDashboardProvider.future);
              },
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 200),
                children: [
                  BrandHeader(
                    leading: IconButton(
                      tooltip: l10n.commonBack,
                      icon: const Icon(Icons.arrow_back_rounded),
                      onPressed: () => context.canPop() ? context.pop() : context.go(Routes.trips),
                    ),
                    trailing: _SosButton(
                      onPressed: () => runSosFlow(
                        context,
                        ref,
                        caseId: caseId,
                        location: _myLocation,
                        onLocated: (p) {
                          if (mounted) setState(() => _myLocation = p);
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  SupportMap(
                    pins: pins,
                    myLocation: _myLocation,
                    onMarkLocation: (p) {
                      setState(() => _myLocation = p);
                      showInfoSnack(context, l10n.supportLocationMarked);
                    },
                  ),
                  if (dashboard.hasError)
                    ErrorView(
                      error: dashboard.error,
                      compact: true,
                      onRetry: () => ref.invalidate(patientDashboardProvider),
                    ),
                  const SizedBox(height: 12),
                  _ScheduleCard(
                    item: schedule.$1,
                    isToday: schedule.$2,
                    onTap: () => _showItinerary(itinerary ?? dashboard.value?.todaySchedule ?? const []),
                  ),
                  SectionTitle(
                    l10n.supportRealtimeNotifications,
                    actionLabel: l10n.commonSeeAll,
                    onAction: () => context.push(Routes.notifications),
                  ),
                  _LatestNotifications(onOpen: _openNotification),
                  SectionTitle(l10n.cultureTipsTitle),
                  ref
                      .watch(culturalTipsProvider)
                      .when(
                        loading: () => const SizedBox(height: 120, child: LoadingView()),
                        error: (e, _) =>
                            ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(culturalTipsProvider)),
                        data: (tips) => tips.isEmpty
                            ? Text(l10n.cultureTipsEmpty, style: context.text.bodyMedium)
                            : CulturalTipsCarousel(tips: tips),
                      ),
                ],
              ),
            ),
            PositionedDirectional(
              end: 16,
              bottom: 16,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _ActionPill(
                    key: const ValueKey('fab-helpline'),
                    icon: Icons.call_rounded,
                    label: l10n.supportCallHelpline,
                    color: AppColors.danger,
                    onTap: _callHelpline,
                  ),
                  const SizedBox(height: 10),
                  _ActionPill(
                    key: const ValueKey('fab-translator'),
                    icon: Icons.translate_rounded,
                    label: l10n.supportGetTranslator,
                    color: AppColors.info,
                    onTap: () => _requestService(caseId, ServiceKind.translator, booking?.hospital.city),
                  ),
                  const SizedBox(height: 10),
                  _ActionPill(
                    key: const ValueKey('fab-guide'),
                    icon: Icons.map_outlined,
                    label: l10n.supportLocalGuide,
                    color: AppColors.primaryDark,
                    onTap: () => _requestService(caseId, ServiceKind.localGuide, booking?.hospital.city),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Today's first upcoming item (or the next scheduled one) and whether it is today.
  (ItineraryItem?, bool) _schedule(List<ItineraryItem>? itinerary, List<ItineraryItem> today) {
    final now = DateTime.now();
    final all = [...?itinerary, ...today].where((i) => i.status != ItineraryItemStatus.cancelled).toList()
      ..sort((a, b) => (a.startsAt ?? DateTime(9999)).compareTo(b.startsAt ?? DateTime(9999)));
    final todays = all.where((i) => Dates.isSameDay(i.startsAt, now)).toList();
    final upcomingToday = todays.where((i) => (i.endsAt ?? i.startsAt ?? now).isAfter(now)).firstOrNull;
    if (upcomingToday != null) return (upcomingToday, true);
    if (todays.isNotEmpty) return (todays.last, true);
    final next = all.where((i) => i.startsAt != null && i.startsAt!.isAfter(now)).firstOrNull;
    return (next, false);
  }

  Future<void> _callHelpline() async {
    try {
      final h = await ref.read(helplinesProvider.future);
      if (!mounted) return;
      await callNumber(context, h.support24x7 ?? h.emergency);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    }
  }

  Future<void> _requestService(String? caseId, ServiceKind kind, String? city) async {
    if (caseId == null) {
      showInfoSnack(context, context.l10n.supportBookFirst);
      return;
    }
    final ok = await showServiceRequestSheet(context, caseId: caseId, kind: kind, city: city);
    if (ok == true && mounted) {
      showInfoSnack(
        context,
        kind == ServiceKind.translator ? context.l10n.supportTranslatorRequested : context.l10n.supportGuideRequested,
      );
    }
  }

  void _openNotification(AppNotification n) {
    if (!n.isRead) {
      ref.read(messagingRepositoryProvider).markNotificationRead(n.id).then((_) {
        ref.invalidate(notificationsProvider);
        ref.invalidate(unreadNotificationsCountProvider);
      }, onError: (Object _) {});
    }
    final target = notificationTarget(n);
    if (target != null) context.push(target);
  }

  void _showItinerary(List<ItineraryItem> items) {
    final sorted = [...items]..sort((a, b) => (a.startsAt ?? DateTime(9999)).compareTo(b.startsAt ?? DateTime(9999)));
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.75),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            children: [
              Text(ctx.l10n.supportScheduleTitle, style: ctx.text.titleLarge),
              const SizedBox(height: 8),
              if (sorted.isEmpty)
                Text(ctx.l10n.supportScheduleEmpty, style: ctx.text.bodyMedium)
              else
                for (final i in sorted)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(_itineraryIcon(i.kind), color: AppColors.violet),
                    title: Text(i.title),
                    subtitle: Text(
                      [
                        if (i.startsAt != null)
                          ctx.l10n.supportScheduleWhen(
                            Dates.weekday(i.startsAt),
                            Dates.timeRange(i.startsAt, i.endsAt),
                          ),
                        ?i.location,
                      ].join('\n'),
                    ),
                    trailing: i.status == ItineraryItemStatus.done
                        ? const Icon(Icons.check_circle_rounded, color: AppColors.primary)
                        : null,
                  ),
            ],
          ),
        ),
      ),
    );
  }

  static IconData _itineraryIcon(ItineraryKind k) => switch (k) {
    ItineraryKind.appointment || ItineraryKind.followup => Icons.medical_services_outlined,
    ItineraryKind.admission => Icons.login_rounded,
    ItineraryKind.surgery => Icons.healing_rounded,
    ItineraryKind.pickup => Icons.airport_shuttle_rounded,
    ItineraryKind.checkin || ItineraryKind.checkout => Icons.hotel_rounded,
    ItineraryKind.sightseeing => Icons.photo_camera_outlined,
    ItineraryKind.other => Icons.event_note_rounded,
  };
}

class _ScheduleCard extends StatelessWidget {
  const _ScheduleCard({required this.item, required this.isToday, required this.onTap});

  final ItineraryItem? item;
  final bool isToday;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final i = item;
    final l10n = context.l10n;
    return AppCard(
      onTap: onTap,
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isToday || i == null ? l10n.supportTodaysSchedule : l10n.supportNextOnSchedule,
                  style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary),
                ),
                const SizedBox(height: 2),
                Text(
                  i?.title ?? l10n.supportNothingToday,
                  style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
                if (i?.startsAt != null) ...[
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Icon(Icons.schedule_rounded, size: 14, color: context.palette.textSecondary),
                      const SizedBox(width: 4),
                      Text(
                        isToday ? Dates.timeRange(i!.startsAt, i.endsAt) : Dates.dayTime(i!.startsAt),
                        style: context.text.bodySmall,
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
    );
  }
}

class _LatestNotifications extends ConsumerWidget {
  const _LatestNotifications({required this.onOpen});

  final ValueChanged<AppNotification> onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);
    return async.when(
      loading: () => const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator()),
      error: (e, _) => ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(notificationsProvider)),
      data: (list) {
        if (list.isEmpty) {
          return Text(
            context.l10n.supportNotificationsEmpty,
            style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
          );
        }
        final sorted = [...list]..sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
        return Column(
          children: [
            for (final n in sorted.take(2))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: NotificationTile(notification: n, dense: true, onTap: () => onOpen(n)),
              ),
          ],
        );
      },
    );
  }
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({super.key, required this.icon, required this.label, required this.color, required this.onTap});

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      elevation: 6,
      shadowColor: Colors.black54,
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Text(
                label,
                style: context.text.labelLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SosButton extends StatelessWidget {
  const _SosButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: context.l10n.sosButtonSemantics,
      excludeSemantics: true,
      child: Material(
        color: AppColors.danger,
        shape: const CircleBorder(),
        elevation: 4,
        child: InkWell(
          key: const ValueKey('sos-button'),
          customBorder: const CircleBorder(),
          onTap: onPressed,
          child: const SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: Text(
                'SOS',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
