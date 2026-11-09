import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';

/// "Dr. Rajesh Sharma / Cardiologist / Apollo Hospital, New Delhi" card with photo and an expand
/// chevron revealing qualifications, experience and languages.
class DoctorHeaderCard extends StatefulWidget {
  const DoctorHeaderCard({super.key, required this.hospital, this.doctorRef, this.doctor, this.specialtyName});

  final HospitalRef hospital;
  final DoctorRef? doctorRef;

  /// Full card when the hospital detail lists the doctor (photo, qualifications...).
  final DoctorCard? doctor;
  final String? specialtyName;

  @override
  State<DoctorHeaderCard> createState() => _DoctorHeaderCardState();
}

class _DoctorHeaderCardState extends State<DoctorHeaderCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final d = widget.doctor;
    final name = d?.fullName ?? widget.doctorRef?.fullName;
    final specialty =
        d?.specialty?.name ?? widget.doctorRef?.specialtyName ?? widget.specialtyName ?? l10n.bookingTreatmentFallback;
    final place = [widget.hospital.name, if (widget.hospital.city != null) widget.hospital.city].join(', ');
    final hasDetails =
        d != null && (d.qualifications.isNotEmpty || d.experienceYears != null || d.languages.isNotEmpty);
    return AppCard(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 8, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (name != null)
                      Text(name, style: context.text.labelMedium?.copyWith(color: context.palette.textSecondary)),
                    Text(
                      _profession(l10n, specialty),
                      style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      place,
                      style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Avatar(imageUrl: d?.photoUrl, name: name ?? widget.hospital.name, size: 64, square: true),
              if (hasDetails)
                IconButton(
                  tooltip: _expanded ? l10n.bookDoctorHideDetails : l10n.bookDoctorShowDetails,
                  onPressed: () => setState(() => _expanded = !_expanded),
                  icon: AnimatedRotation(
                    turns: _expanded ? 0.5 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: const Icon(Icons.keyboard_arrow_down_rounded),
                  ),
                )
              else
                const SizedBox(width: 8),
            ],
          ),
          if (_expanded && d != null) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [for (final q in d.qualifications) StatusBadge(label: q, color: AppColors.violet, dense: true)],
            ),
            const SizedBox(height: 8),
            if (d.experienceYears != null)
              Text(l10n.bookDoctorExperience(d.experienceYears!), style: context.text.bodySmall),
            if (d.languages.isNotEmpty)
              Text(l10n.bookDoctorSpeaks(d.languages.join(', ')), style: context.text.bodySmall),
            if (d.ratingAvg != null) ...[
              const SizedBox(height: 4),
              RatingStars(rating: d.ratingAvg!, count: d.ratingCount),
            ],
          ],
        ],
      ),
    );
  }

  /// "Cardiology" -> "Cardiologist" style label when it is a common specialty; otherwise unchanged.
  static String _profession(AppLocalizations l10n, String specialty) {
    return switch (specialty.toLowerCase()) {
      'cardiology' => l10n.bookProfessionCardiologist,
      'orthopedics' || 'orthopaedics' => l10n.bookProfessionOrthopedicSurgeon,
      'oncology' => l10n.bookProfessionOncologist,
      'neurology' => l10n.bookProfessionNeurologist,
      'dental' || 'dentistry' => l10n.bookProfessionDentist,
      'urology' => l10n.bookProfessionUrologist,
      'nephrology' => l10n.bookProfessionNephrologist,
      'gastroenterology' => l10n.bookProfessionGastroenterologist,
      'ophthalmology' => l10n.bookProfessionOphthalmologist,
      'dermatology' => l10n.bookProfessionDermatologist,
      _ => specialty,
    };
  }
}
