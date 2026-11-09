import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';

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
    final d = widget.doctor;
    final name = d?.fullName ?? widget.doctorRef?.fullName;
    final specialty = d?.specialty?.name ?? widget.doctorRef?.specialtyName ?? widget.specialtyName ?? 'Treatment';
    final place = [widget.hospital.name, if (widget.hospital.city != null) widget.hospital.city].join(', ');
    final hasDetails =
        d != null && (d.qualifications.isNotEmpty || d.experienceYears != null || d.languages.isNotEmpty);
    return AppCard(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
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
                      _profession(specialty),
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
                  tooltip: _expanded ? 'Hide doctor details' : 'Show doctor details',
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
              Text('${d.experienceYears} years of experience', style: context.text.bodySmall),
            if (d.languages.isNotEmpty) Text('Speaks ${d.languages.join(', ')}', style: context.text.bodySmall),
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
  static String _profession(String specialty) {
    const map = {
      'cardiology': 'Cardiologist',
      'orthopedics': 'Orthopedic Surgeon',
      'orthopaedics': 'Orthopedic Surgeon',
      'oncology': 'Oncologist',
      'neurology': 'Neurologist',
      'dental': 'Dentist',
      'dentistry': 'Dentist',
      'urology': 'Urologist',
      'nephrology': 'Nephrologist',
      'gastroenterology': 'Gastroenterologist',
      'ophthalmology': 'Ophthalmologist',
      'dermatology': 'Dermatologist',
    };
    return map[specialty.toLowerCase()] ?? specialty;
  }
}
