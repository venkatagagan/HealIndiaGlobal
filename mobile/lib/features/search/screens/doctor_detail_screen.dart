import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../consultations/screens/consultation_book_screen.dart';
import '../widgets/availability_strip.dart';
import '../widgets/catalog_cards.dart';
import '../widgets/detail_sections.dart';
import '../widgets/request_quote_sheet.dart';
import '../widgets/save_button.dart';
import 'reviews_screen.dart';

/// Doctor detail: profile, qualifications, languages, procedures, availability preview,
/// save/unsave; Get matched / Request quote.
///
/// Route: `/doctors/:id` · Owner: fl-onboarding.
class DoctorDetailScreen extends ConsumerWidget {
  const DoctorDetailScreen({super.key, required this.doctorId});

  final String doctorId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(doctorDetailProvider(doctorId));
    return Scaffold(
      appBar: AppBar(
        title: Text(context.l10n.doctorDetailTitle),
        actions: [if (value.hasValue) SaveButton(entityType: SavedEntityType.doctor, entityId: value.requireValue.id)],
      ),
      bottomNavigationBar: value.hasValue
          ? DetailActionsBar(
              onGetMatched: () => context.push(Routes.screeningStart(specialty: value.requireValue.specialty?.slug)),
              onRequestQuote: () {
                final d = value.requireValue;
                requestQuote(
                  context,
                  ref,
                  hospitalId: d.hospital.id,
                  hospitalName: d.hospital.name,
                  doctorId: d.id,
                  doctorName: d.fullName,
                  specialtyId: d.specialty?.id,
                  procedures: d.procedures,
                );
              },
            )
          : null,
      body: AsyncValueView<DoctorDetail>(
        value: value,
        onRetry: () => ref.invalidate(doctorDetailProvider(doctorId)),
        data: (d) => RefreshIndicator(
          onRefresh: () => ref.refresh(doctorDetailProvider(doctorId).future),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              _Header(doctor: d),
              // Agents may browse doctors but book through their own portal.
              ..._sections(
                context,
                d,
                canBookConsultation: !{
                  UserRole.agent,
                  UserRole.hospital,
                }.contains(ref.watch(currentUserProvider)?.role),
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _sections(BuildContext context, DoctorDetail d, {required bool canBookConsultation}) {
    final l10n = context.l10n;
    return [
      const SizedBox(height: 16),
      AppCard(
        child: Row(
          children: [
            InfoStat(
              icon: Icons.workspace_premium_outlined,
              value: d.experienceYears == null ? '-' : l10n.doctorDetailExperienceYears(d.experienceYears!),
              label: l10n.doctorDetailExperience,
            ),
            InfoStat(
              icon: Icons.trending_up_rounded,
              value: d.successRatePct == null ? '-' : l10n.catalogPercent(d.successRatePct!.round()),
              label: l10n.doctorDetailSuccessRate,
            ),
            InfoStat(
              icon: Icons.star_outline_rounded,
              value: d.ratingAvg == null ? '-' : d.ratingAvg!.toStringAsFixed(1),
              label: l10n.doctorDetailReviewCount(d.ratingCount),
            ),
          ],
        ),
      ),
      if (d.consultationFeeMinor != null) ...[
        const SizedBox(height: 12),
        AppCard(
          child: Row(
            children: [
              Icon(
                d.teleconsultAvailable ? Icons.videocam_outlined : Icons.medical_information_outlined,
                color: AppColors.info,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  d.teleconsultAvailable ? l10n.doctorDetailVideoConsultAvailable : l10n.doctorDetailConsultationFee,
                  style: context.text.bodyMedium,
                ),
              ),
              ApproxPrice(
                d.consultationFeeMinor!,
                d.currency,
                display: d.displayConsultationFee,
                crossAxisAlignment: CrossAxisAlignment.end,
                style: context.text.titleSmall,
              ),
            ],
          ),
        ),
      ],
      if (d.teleconsultAvailable && canBookConsultation) ...[
        const SizedBox(height: 10),
        PrimaryButton(
          key: const ValueKey('doctor-book-video-consultation'),
          label: l10n.consultBookVideoButton,
          icon: Icons.videocam_rounded,
          onPressed: () =>
              bookVideoConsultation(context, hospitalId: d.hospital.id, doctorId: d.id, specialtyId: d.specialty?.id),
        ),
      ],
      if ((d.bio ?? '').isNotEmpty) DetailSection(title: l10n.catalogAboutSection, child: ExpandableText(d.bio!)),
      if (d.qualifications.isNotEmpty)
        DetailSection(
          title: l10n.doctorDetailQualifications,
          child: PillWrap(d.qualifications, icon: Icons.school_outlined),
        ),
      if (d.subSpecialties.isNotEmpty)
        DetailSection(
          title: l10n.doctorDetailExpertise,
          child: PillWrap(d.subSpecialties, icon: Icons.medical_services_outlined),
        ),
      if (d.languages.isNotEmpty)
        DetailSection(
          title: l10n.catalogLanguagesSpoken,
          child: PillWrap(d.languages, icon: Icons.translate_rounded),
        ),
      DetailSection(
        title: l10n.availabilitySection,
        child: AvailabilityPreview(id: d.id, doctor: true, nextAvailable: d.nextAvailableDate),
      ),
      if (d.procedures.isNotEmpty)
        DetailSection(
          title: l10n.catalogTreatmentsPrices,
          child: Column(
            children: [
              for (final p in d.procedures)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: HospitalProcedureCard(item: p),
                ),
            ],
          ),
        ),
      DetailSection(
        title: l10n.hospitalDetailPatientReviews,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (d.reviews.isEmpty)
              Text(l10n.reviewsEmptyMessage, style: context.text.bodySmall)
            else
              for (final r in d.reviews.take(3))
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ReviewTile(review: r, showHospital: true, reportable: true),
                ),
            if (d.reviews.isNotEmpty)
              SecondaryButton(
                key: const ValueKey('doctor-all-reviews'),
                label: l10n.reviewsSeeAll(d.ratingCount > 0 ? d.ratingCount : d.reviews.length),
                icon: Icons.rate_review_outlined,
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => ReviewsScreen.doctor(id: d.id, title: d.fullName),
                  ),
                ),
              ),
          ],
        ),
      ),
    ];
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.doctor});

  final DoctorDetail doctor;

  @override
  Widget build(BuildContext context) {
    final d = doctor;
    final l10n = context.l10n;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Avatar(imageUrl: d.photoUrl, name: d.fullName, size: 88, square: true),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(d.fullName, style: context.text.headlineSmall),
              if (d.subtitle.isNotEmpty) Text(d.subtitle, style: context.text.bodySmall),
              const SizedBox(height: 6),
              InkWell(
                onTap: () => context.push(Routes.hospital(d.hospital.id)),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      const Icon(Icons.local_hospital_outlined, size: 16, color: AppColors.primary),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          [d.hospital.name, d.hospital.city].whereType<String>().join(', '),
                          style: context.text.bodySmall?.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: [
                  if (d.registrationVerified)
                    Semantics(
                      label: l10n.trustRegistrationVerifiedSemantics(d.registrationCouncilName ?? ''),
                      excludeSemantics: true,
                      child: Tooltip(
                        message: d.registrationCouncilName ?? l10n.trustRegistrationVerified,
                        child: StatusBadge(
                          key: const ValueKey('doctor-registration-verified'),
                          label: l10n.trustRegistrationVerified,
                          color: AppColors.primary,
                          icon: Icons.verified_user_outlined,
                          dense: true,
                        ),
                      ),
                    ),
                  if (d.hospital.accreditations.isNotEmpty) AccreditationBadges(d.hospital.accreditations),
                ],
              ),
              if (d.nextAvailableConsultation != null || d.nextAvailableAdmission != null) ...[
                const SizedBox(height: 6),
                EarliestDates(consultation: d.nextAvailableConsultation, admission: d.nextAvailableAdmission),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
