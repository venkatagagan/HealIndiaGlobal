import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/network/realtime_service.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../messages/widgets/notification_bell.dart';
import '../services/journey_actions.dart';
import '../widgets/checklist_tile.dart';
import '../widgets/emergency_contacts_sheet.dart';
import 'pre_arrival_guide_screen.dart';
import 'travel_screen.dart';

/// Pre-Arrival Dashboard: "Until Treatment N days", checklist, quick actions (upload documents,
/// chat with coordinator, emergency contacts, pre-arrival guide) and links to travel and support.
///
/// Route: `/trips` (tab) · Owner: fl-journey.
class TripsScreen extends ConsumerWidget {
  const TripsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(realtimeEventsProvider, (_, next) {
      final type = next.value?.type;
      if (type == RealtimeEvents.bookingUpdated || type == RealtimeEvents.caseUpdated) {
        ref.invalidate(patientDashboardProvider);
      }
    });
    final dashboard = ref.watch(patientDashboardProvider);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const BrandHeader(trailing: NotificationBell()),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => ref.refresh(patientDashboardProvider.future),
                child: AsyncValueView<PatientDashboard>(
                  value: dashboard,
                  onRetry: () => ref.invalidate(patientDashboardProvider),
                  data: (d) => _Dashboard(dashboard: d),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Dashboard extends ConsumerWidget {
  const _Dashboard({required this.dashboard});

  final PatientDashboard dashboard;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final booking = dashboard.nextBooking;
    final checklist = [...dashboard.checklist]..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        if (booking == null) const _NoTrip() else _Countdown(booking: booking, days: _daysUntil(booking)),
        if (booking != null && booking.balanceDueMinor > 0 && booking.status != BookingStatus.cancelled) ...[
          const SizedBox(height: 12),
          _BalanceCard(booking: booking),
        ],
        if (checklist.isNotEmpty) ...[
          SectionTitle(l10n.checklistTitle),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Column(
              children: [
                for (final item in checklist)
                  ChecklistTile(
                    item: item,
                    onTap: booking == null ? null : () => _onChecklistTap(context, item, booking),
                  ),
              ],
            ),
          ),
        ],
        if (dashboard.todaySchedule.isNotEmpty) ...[
          SectionTitle(l10n.tripsTodaySchedule),
          for (final item in dashboard.todaySchedule.take(3))
            AppCard(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              onTap: () => context.push(Routes.support),
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.event_note_rounded, color: AppColors.violet),
                title: Text(item.title),
                subtitle: Text(
                  [Dates.timeRange(item.startsAt, item.endsAt), ?item.location].where((s) => s.isNotEmpty).join(' · '),
                ),
                trailing: const Icon(Icons.chevron_right_rounded),
              ),
            ),
        ],
        SectionTitle(l10n.tripsQuickActions),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.35,
          children: [
            _QuickAction(
              key: const ValueKey('qa-documents'),
              icon: Icons.upload_file_rounded,
              label: l10n.tripsUploadDocuments,
              onTap: () => context.push(Routes.documentsFor(caseId: booking?.caseId)),
            ),
            _QuickAction(
              key: const ValueKey('qa-chat'),
              icon: Icons.chat_outlined,
              label: l10n.tripsChatWithCoordinator,
              onTap: () => openCoordinatorChat(context, ref, caseId: booking?.caseId),
            ),
            _QuickAction(
              key: const ValueKey('qa-emergency'),
              icon: Icons.contact_emergency_outlined,
              label: l10n.tripsEmergencyContacts,
              onTap: () => showEmergencyContactsSheet(context, coordinator: dashboard.coordinator),
            ),
            _QuickAction(
              key: const ValueKey('qa-guide'),
              icon: Icons.description_outlined,
              label: l10n.preArrivalTitle,
              onTap: () =>
                  Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PreArrivalGuideScreen())),
            ),
          ],
        ),
        SectionTitle(l10n.journeySectionTitle),
        if (booking != null)
          _LinkCard(
            icon: Icons.flight_rounded,
            title: l10n.travelVisaAndTravel,
            subtitle: l10n.tripsTravelSubtitle,
            onTap: () => _openTravel(context, booking),
          ),
        _LinkCard(
          icon: Icons.support_agent_rounded,
          title: l10n.tripsSupportTitle,
          subtitle: l10n.tripsSupportSubtitle,
          onTap: () => context.push(Routes.support),
        ),
        _LinkCard(
          icon: Icons.folder_shared_outlined,
          title: l10n.tripsMyCases,
          subtitle: l10n.tripsActiveCases(dashboard.activeCases),
          onTap: () => context.push(Routes.cases),
        ),
        if (dashboard.coordinator != null)
          _LinkCard(
            icon: Icons.badge_outlined,
            title: l10n.tripsYourCoordinator(dashboard.coordinator!.fullName),
            subtitle: l10n.tripsMessageAnyTime,
            onTap: () => openCoordinatorChat(context, ref, caseId: booking?.caseId),
          ),
      ],
    );
  }

  int? _daysUntil(Booking b) {
    if (dashboard.daysUntilTreatment != null) return dashboard.daysUntilTreatment;
    final d = b.admissionDate;
    return d == null ? null : Dates.daysUntil(d);
  }

  void _openTravel(BuildContext context, Booking b) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => TravelScreen(
          caseId: b.caseId,
          hospitalId: b.hospital.id,
          hospitalCity: b.hospital.city,
          admissionDate: b.admissionDate,
          dischargeDate: b.dischargeDate,
        ),
      ),
    );
  }

  void _onChecklistTap(BuildContext context, ChecklistItem item, Booking booking) {
    switch (item.knownKey) {
      case ChecklistKey.treatmentBooked:
        context.push(Routes.caseDetail(booking.caseId));
      case ChecklistKey.documentsUploaded:
        context.push(Routes.documentsFor(caseId: booking.caseId));
      case ChecklistKey.travelInsurance:
        context.push(Routes.documentsFor(caseId: booking.caseId, kind: DocumentKind.other));
      case ChecklistKey.visaApproved ||
          ChecklistKey.flightBooked ||
          ChecklistKey.airportPickup ||
          ChecklistKey.accommodationBooked:
        _openTravel(context, booking);
      case null:
        _openTravel(context, booking);
    }
  }
}

class _Countdown extends StatelessWidget {
  const _Countdown({required this.booking, required this.days});

  final Booking booking;
  final int? days;

  @override
  Widget build(BuildContext context) {
    final d = days;
    final l10n = context.l10n;
    final (String big, String unit) = switch (d) {
      null => ('--', l10n.tripsCountdownUnit(0)),
      0 => (l10n.tripsCountdownToday, ''),
      < 0 => booking.status == BookingStatus.completed ? (l10n.tripsCountdownDone, '') : (l10n.tripsCountdownNow, ''),
      _ => ('$d', l10n.tripsCountdownUnit(d)),
    };
    final label = d != null && d < 0 ? l10n.tripsTreatmentInProgress : l10n.tripsUntilTreatment;
    return Column(
      children: [
        const SizedBox(height: 8),
        Text(label, style: context.text.titleSmall?.copyWith(color: context.palette.textSecondary)),
        const SizedBox(height: 4),
        Semantics(
          label: d != null && d > 0 ? l10n.tripsDaysUntilTreatment(d) : label,
          excludeSemantics: true,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                big,
                key: const ValueKey('countdown-days'),
                style: context.text.displayLarge?.copyWith(
                  color: AppColors.violet,
                  fontWeight: FontWeight.w900,
                  fontSize: 64,
                  height: 1.05,
                ),
              ),
              if (unit.isNotEmpty) ...[
                const SizedBox(width: 10),
                Text(unit, style: context.text.titleLarge?.copyWith(color: context.palette.textSecondary)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text(
          [
            booking.procedure?.name ?? booking.package?.name,
            booking.hospital.name,
            if (booking.admissionDate != null) Dates.weekday(booking.admissionDate),
          ].whereType<String>().join(' · '),
          textAlign: TextAlign.center,
          style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
        ),
        const SizedBox(height: 6),
        StatusBadge.forEnum(booking.status, dense: true),
      ],
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.booking});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      borderColor: AppColors.violet.withValues(alpha: 0.5),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  booking.isPendingPayment ? context.l10n.tripsPaymentNeeded : context.l10n.tripsBalanceDue,
                  style: context.text.labelMedium?.copyWith(color: context.palette.textSecondary),
                ),
                MoneyText(
                  booking.balanceDueMinor,
                  booking.currency,
                  style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                ),
              ],
            ),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.violet,
              foregroundColor: Colors.white,
              // The theme's full-width minimum size cannot be laid out inside a Row.
              minimumSize: const Size(0, 44),
            ),
            onPressed: () => context.push(Routes.pay(booking.id)),
            child: Text(context.l10n.tripsPayNow),
          ),
        ],
      ),
    );
  }
}

class _NoTrip extends StatelessWidget {
  const _NoTrip();

  @override
  Widget build(BuildContext context) {
    return AppCard(
      margin: const EdgeInsets.only(top: 8),
      child: Column(
        children: [
          const Icon(Icons.flight_takeoff_rounded, size: 40, color: AppColors.violet),
          const SizedBox(height: 10),
          Text(context.l10n.tripsNoTripTitle, style: context.text.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: 4),
          Text(
            context.l10n.tripsNoTripBody,
            style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          PrimaryButton(
            label: context.l10n.caseFindMyTreatment,
            tone: ButtonTone.violet,
            onPressed: () => context.push(Routes.screeningStart()),
          ),
          const SizedBox(height: 8),
          SecondaryButton(label: context.l10n.casesTitle, onPressed: () => context.push(Routes.cases)),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({super.key, required this.icon, required this.label, required this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label.replaceAll('\n', ' '),
      excludeSemantics: true,
      child: AppCard(
        onTap: onTap,
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: AppColors.violet, size: 28),
            const SizedBox(height: 10),
            Text(
              label,
              textAlign: TextAlign.center,
              style: context.text.labelLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}

class _LinkCard extends StatelessWidget {
  const _LinkCard({required this.icon, required this.title, required this.subtitle, required this.onTap});

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      onTap: onTap,
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: CircleAvatar(
          backgroundColor: AppColors.violetSoft,
          child: Icon(icon, color: AppColors.violet),
        ),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right_rounded),
      ),
    );
  }
}
