import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';

/// Upcoming-trip banner from `/patient/dashboard.next_booking` (taps through to the Trips tab).
class UpcomingTripBanner extends StatelessWidget {
  const UpcomingTripBanner({super.key, required this.booking, this.daysUntil});

  final Booking booking;
  final int? daysUntil;

  @override
  Widget build(BuildContext context) {
    final days = daysUntil ?? (booking.admissionDate == null ? null : Dates.daysUntil(booking.admissionDate!));
    final when = switch (days) {
      null => 'Date to be confirmed',
      0 => 'Today',
      1 => 'Tomorrow',
      final d when d < 0 => 'In progress',
      final d => 'In $d days',
    };
    final what = [booking.procedure?.name, booking.hospital.name].whereType<String>().join(' · ');
    return _BannerCard(
      gradient: const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFF2563EB)]),
      icon: Icons.flight_takeoff_rounded,
      eyebrow: 'Your upcoming trip',
      title: what.isEmpty ? 'Treatment in India' : what,
      subtitle: [
        when,
        if (booking.admissionDate != null) 'Admission ${Dates.day(booking.admissionDate)}',
        booking.hospital.city,
      ].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
      onTap: () => context.go(Routes.trips),
    );
  }
}

/// Resume a draft screening or open finished matches.
class ScreeningResumeBanner extends StatelessWidget {
  const ScreeningResumeBanner({super.key, required this.screening});

  final ScreeningSummary screening;

  @override
  Widget build(BuildContext context) {
    final specialty = screening.specialty?.name;
    final (title, subtitle, target) = switch (screening.status) {
      ScreeningStatus.completed => (
        'Your matches are ready',
        specialty == null ? 'See hospitals and doctors matched to you' : '$specialty · see your matched doctors',
        Routes.matches(screening.id),
      ),
      ScreeningStatus.processing => (
        'Finding your best matches',
        'We are analysing your answers',
        Routes.screeningProcessing(screening.id),
      ),
      _ => (
        'Continue your screening',
        specialty == null ? 'Pick up where you left off' : '$specialty · pick up where you left off',
        Routes.screeningStep(screening.id, 1),
      ),
    };
    return _BannerCard(
      gradient: const LinearGradient(colors: [Color(0xFF15803D), Color(0xFF0E7490)]),
      icon: Icons.assignment_turned_in_outlined,
      eyebrow: 'AI screening',
      title: title,
      subtitle: subtitle,
      onTap: () => context.push(target),
    );
  }
}

class _BannerCard extends StatelessWidget {
  const _BannerCard({
    required this.gradient,
    required this.icon,
    required this.eyebrow,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final Gradient gradient;
  final IconData icon;
  final String eyebrow;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(AppRadius.lg);
    return Semantics(
      button: true,
      label: '$eyebrow. $title. $subtitle',
      excludeSemantics: true,
      child: Material(
        color: Colors.transparent,
        child: Ink(
          decoration: BoxDecoration(gradient: gradient, borderRadius: br),
          child: InkWell(
            borderRadius: br,
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: const BoxDecoration(color: Color(0x33FFFFFF), shape: BoxShape.circle),
                    child: Icon(icon, color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(eyebrow, style: context.text.labelSmall?.copyWith(color: Colors.white70)),
                        Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.titleSmall?.copyWith(color: Colors.white, fontWeight: FontWeight.w800),
                        ),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.text.bodySmall?.copyWith(color: Colors.white),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: Colors.white),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
