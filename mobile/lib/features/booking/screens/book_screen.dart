import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/booking_repository.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/partner_repository.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../logic/admission_availability.dart';
import '../logic/booking_gates.dart';
import '../logic/payment_plan.dart';
import '../providers/booking_providers.dart';
import '../widgets/approx_money_text.dart';
import '../widgets/availability_calendar.dart';
import '../widgets/doctor_header_card.dart';
import '../widgets/option_radio_card.dart';

/// Treatment Selection ("Select Dates"): doctor header, admission calendar from
/// `/hospitals/{id}/availability`, treatment duration, package or accepted quote, payment option,
/// then `POST /bookings` and on to payment.
///
/// Instalments (CG-18) are an interest-free pre-payment plan: `GET /financing/installment-plan` gives the
/// month counts allowed for the admission date (the last instalment is due before admission) and the
/// schedule; longer terms only through a pay-later partner (`/insurance?tab=pay_later`).
///
/// Route: `/book/:caseId?quote=&package=` · Owner: fl-journey.
class BookScreen extends ConsumerStatefulWidget {
  const BookScreen({super.key, required this.caseId, this.quoteId, this.packageId});

  final String caseId;

  final String? quoteId;

  final String? packageId;

  @override
  ConsumerState<BookScreen> createState() => _BookScreenState();
}

class _BookScreenState extends ConsumerState<BookScreen> {
  late DateTime _month;
  DateTime? _date;
  String? _packageId;
  String? _quoteId;
  bool _selectionResolved = false;
  PaymentOption _option = PaymentOption.full;
  int _months = 6;
  bool _insurance = false;
  bool _submitting = false;

  /// Last instalment plan seen for [_planDate] (shown while the plan for another month count loads).
  InstallmentPlan? _plan;
  String? _planDate;
  bool _planSyncScheduled = false;

  @override
  void initState() {
    super.initState();
    final tomorrow = Dates.dateOnly(DateTime.now()).add(const Duration(days: 1));
    _month = DateTime(tomorrow.year, tomorrow.month);
  }

  @override
  Widget build(BuildContext context) {
    final caseAsync = ref.watch(caseDetailProvider(widget.caseId));
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.bookSelectDatesTitle), centerTitle: true),
      body: AsyncValueView<MedicalCaseDetail>(
        value: caseAsync,
        onRetry: () => ref.invalidate(caseDetailProvider(widget.caseId)),
        data: (c) {
          final existing = c.booking;
          if (existing != null && existing.status != BookingStatus.cancelled) {
            return _ExistingBooking(booking: existing, caseId: c.id);
          }
          if (!c.isOpen) {
            return EmptyView(
              icon: Icons.block_rounded,
              title: context.l10n.bookCaseClosedTitle(c.status.label.toLowerCase()),
              message: context.l10n.bookCaseClosedBody,
              actionLabel: context.l10n.caseViewCase,
              onAction: () => context.pushReplacement(Routes.caseDetail(c.id)),
            );
          }
          return _form(c);
        },
      ),
      bottomNavigationBar: caseAsync.value == null || _hasActiveBooking(caseAsync.value!)
          ? null
          : SafeArea(
              minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: PrimaryButton(
                key: const ValueKey('proceed-to-payment'),
                label: context.l10n.bookProceedToPayment,
                tone: ButtonTone.violet,
                loading: _submitting,
                onPressed: _canSubmit ? () => _submit(caseAsync.value!) : null,
              ),
            ),
    );
  }

  bool _hasActiveBooking(MedicalCaseDetail c) =>
      (c.booking != null && c.booking!.status != BookingStatus.cancelled) || !c.isOpen;

  bool get _canSubmit =>
      _date != null &&
      (_packageId != null || _quoteId != null) &&
      !(_option == PaymentOption.installments && _plan != null && !_plan!.installmentsAvailable);

  /// Watches the instalment plan for the chosen admission date (null before a date is picked).
  AsyncValue<InstallmentPlan>? _watchPlan(int? priceMinor) {
    final date = _date;
    if (date == null) return null;
    final query = (
      admissionDate: Dates.api(date),
      months: _months,
      totalMinor: priceMinor != null && priceMinor > 0 ? priceMinor : null,
      depositMinor: null,
      country: ref.watch(partnerCountryProvider),
    );
    final value = ref.watch(installmentPlanProvider(query));
    final plan = value.value;
    if (plan != null) {
      _plan = plan;
      _planDate = query.admissionDate;
      _syncWithPlan(plan);
    } else if (_planDate != query.admissionDate) {
      _plan = null;
    }
    return value;
  }

  /// Keeps the month count within `allowed_months` and leaves the instalment option when none is allowed.
  void _syncWithPlan(InstallmentPlan plan) {
    final months = plan.closestAllowed(_months);
    final needsMonths = months != null && months != _months;
    final needsOption = !plan.installmentsAvailable && _option == PaymentOption.installments;
    if ((!needsMonths && !needsOption) || _planSyncScheduled) return;
    _planSyncScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _planSyncScheduled = false;
      if (!mounted) return;
      setState(() {
        if (needsMonths) _months = months;
        if (needsOption) _option = PaymentOption.deposit;
      });
    });
  }

  Quote? _acceptedQuote(MedicalCaseDetail c) {
    final all = [...c.quotes, ?c.latestQuote];
    for (final q in all) {
      if (q.status == QuoteStatus.accepted) return q;
    }
    return null;
  }

  void _resolveInitialSelection(
    MedicalCaseDetail c,
    Quote? accepted,
    List<({TreatmentPackage package, String procedureName, HospitalProcedure hospitalProcedure})>? packages,
  ) {
    if (_selectionResolved) return;
    if (widget.quoteId != null && accepted?.id == widget.quoteId) {
      _quoteId = accepted!.id;
      _selectionResolved = true;
      return;
    }
    if (packages == null) {
      // Wait for the hospital's packages unless a quote can be used right away.
      if (accepted != null && widget.packageId == null) {
        _quoteId = accepted.id;
        _selectionResolved = true;
      }
      return;
    }
    final wanted = widget.packageId == null ? null : packages.where((p) => p.package.id == widget.packageId);
    if (wanted != null && wanted.isNotEmpty) {
      _packageId = wanted.first.package.id;
    } else if (accepted != null) {
      _quoteId = accepted.id;
    } else if (packages.isNotEmpty) {
      _packageId = packages.first.package.id;
    }
    _selectionResolved = true;
  }

  Widget _form(MedicalCaseDetail c) {
    final l10n = context.l10n;
    final hospitalAsync = ref.watch(hospitalDetailProvider(c.hospital.id));
    final hospital = hospitalAsync.value;
    final packages = hospital == null ? null : packagesForCase(hospital, c);
    final accepted = _acceptedQuote(c);
    _resolveInitialSelection(c, accepted, packages);

    final doctorCard = hospital == null || c.doctor == null
        ? null
        : hospital.doctors.where((d) => d.id == c.doctor!.id).firstOrNull;

    final query = (hospitalId: c.hospital.id, doctorId: c.doctor?.id, month: DateTime(_month.year, _month.month));
    final availAsync = ref.watch(admissionAvailabilityProvider(query));
    final availability = availAsync.value ?? (availAsync.hasError ? AdmissionAvailability.unrestricted() : null);

    final slug = c.procedure?.slug;
    final procedure = slug == null ? null : ref.watch(procedureDetailProvider(slug)).value;
    final selectedPkg = packages?.where((p) => p.package.id == _packageId).firstOrNull;
    final selectedQuote = _quoteId != null && accepted?.id == _quoteId ? accepted : null;
    final duration = selectedQuote?.estimatedStayDays != null
        ? formatStayRange(selectedQuote!.estimatedStayDays, null, l10n)
        : (procedure != null
              ? formatStayRange(procedure.hospitalStayDays, procedure.totalStayDays, l10n)
              : formatStayRange(selectedPkg?.hospitalProcedure.hospitalStayDays, null, l10n));

    final today = Dates.dateOnly(DateTime.now());
    final priceMinor = selectedQuote?.totalMinor ?? selectedPkg?.package.priceMinor;
    final priceCcy = selectedQuote?.currency ?? selectedPkg?.package.currency ?? 'INR';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        DoctorHeaderCard(
          hospital: c.hospital,
          doctorRef: c.doctor,
          doctor: doctorCard,
          specialtyName: c.specialty?.name ?? c.procedure?.name,
        ),
        const SizedBox(height: 16),
        AvailabilityCalendar(
          month: _month,
          selected: _date,
          loading: availAsync.isLoading,
          firstMonth: today.add(const Duration(days: 1)),
          lastMonth: DateTime(today.year + 1, today.month),
          isAvailable: (d) => availability?.isAvailable(d) ?? false,
          onSelect: (d) => setState(() => _date = d),
          onMonthChanged: (m) => setState(() => _month = m),
        ),
        if (availAsync.hasError)
          ErrorView(
            error: availAsync.error,
            compact: true,
            onRetry: () => ref.invalidate(admissionAvailabilityProvider(query)),
          ),
        const SizedBox(height: 12),
        _legend(availability),
        const SizedBox(height: 8),
        Text.rich(
          TextSpan(
            text: l10n.bookTreatmentDurationLabel,
            style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
            children: [
              TextSpan(
                text: duration == null ? l10n.bookDurationConfirmedByHospital : l10n.bookDurationRequired(duration),
                style: TextStyle(color: context.colors.onSurface, fontWeight: FontWeight.w700),
              ),
            ],
          ),
          textAlign: TextAlign.center,
        ),
        if (_date != null) ...[
          const SizedBox(height: 4),
          Text(
            l10n.bookAdmissionOn('${Dates.weekday(_date)} ${_date!.year}'),
            textAlign: TextAlign.center,
            style: context.text.bodySmall?.copyWith(color: AppColors.violet, fontWeight: FontWeight.w600),
          ),
        ],
        SectionTitle(l10n.bookSelectPackage),
        if (accepted != null)
          OptionRadioCard(
            key: ValueKey('quote-${accepted.id}'),
            title: l10n.bookAcceptedQuote,
            subtitle: [
              if (accepted.estimatedStayDays != null) l10n.bookingStayDaysLabel(accepted.estimatedStayDays!),
              if (accepted.validUntil != null) l10n.bookingValidUntil(Dates.day(accepted.validUntil)),
              if (accepted.lineItems.isNotEmpty) l10n.bookItemizedCharges(accepted.lineItems.length),
            ].join(' · '),
            selected: _quoteId == accepted.id,
            onTap: () => setState(() {
              _quoteId = accepted.id;
              _packageId = null;
            }),
            trailing: _PriceColumn(
              minor: accepted.totalMinor,
              currency: accepted.currency,
              display: accepted.displayTotal,
            ),
          ),
        if (hospitalAsync.isLoading)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (hospitalAsync.hasError)
          ErrorView(
            error: hospitalAsync.error,
            compact: true,
            onRetry: () => ref.invalidate(hospitalDetailProvider(c.hospital.id)),
          )
        else if ((packages ?? const []).isEmpty && accepted == null)
          AppCard(child: Text(l10n.bookNoPackages, style: context.text.bodyMedium)),
        for (final p
            in packages ??
                const <({TreatmentPackage package, String procedureName, HospitalProcedure hospitalProcedure})>[])
          OptionRadioCard(
            key: ValueKey('package-${p.package.id}'),
            title: p.package.name.isEmpty ? p.package.tier.label : p.package.name,
            subtitle: _packageSubtitle(p.package, c.procedure == null ? p.procedureName : null),
            selected: _packageId == p.package.id,
            onTap: () => setState(() {
              _packageId = p.package.id;
              _quoteId = null;
            }),
            trailing: _PriceColumn(
              minor: p.package.priceMinor,
              currency: p.package.currency,
              savingsMinor: p.package.savingsMinor,
              display: p.package.displayPrice,
            ),
          ),
        SectionTitle(l10n.bookPaymentOptionSection),
        _paymentOptions(c, priceCcy, _watchPlan(priceMinor)),
        const SizedBox(height: 8),
        CheckboxListTile(
          key: const ValueKey('insurance-claim'),
          contentPadding: EdgeInsets.zero,
          value: _insurance,
          onChanged: (v) => setState(() => _insurance = v ?? false),
          title: Text(l10n.bookingInsuranceClaim),
          subtitle: Text(
            l10n.bookInsuranceHelp,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          controlAffinity: ListTileControlAffinity.trailing,
        ),
        const SizedBox(height: 8),
        _InsuranceOptionsCard(caseId: c.id),
      ],
    );
  }

  Widget _legend(AdmissionAvailability? availability) {
    Widget dot(Color c, String label) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: c, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(label, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
      ],
    );
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 16,
      runSpacing: 4,
      children: [
        dot(AppColors.primary, context.l10n.bookLegendAvailable),
        dot(AppColors.violet, context.l10n.bookLegendSelected),
        dot(
          context.palette.textMuted,
          availability?.restricted ?? true ? context.l10n.bookLegendUnavailable : context.l10n.bookLegendPast,
        ),
      ],
    );
  }

  String _packageSubtitle(TreatmentPackage pkg, String? procedureName) {
    final parts = <String>[
      ?procedureName,
      if (pkg.description != null && pkg.description!.isNotEmpty) pkg.description!,
      if (pkg.description == null || pkg.description!.isEmpty)
        switch (pkg.tier) {
          PackageTier.medicalOnly => context.l10n.bookPackageMedicalOnly,
          PackageTier.medicalStay => context.l10n.bookPackageMedicalStay,
          PackageTier.allInclusive => context.l10n.bookPackageAllInclusive,
        },
    ];
    final bullets = pkg.includes.bullets;
    if (bullets.isNotEmpty) parts.add(bullets.take(3).join(', '));
    return parts.join('\n');
  }

  Widget _paymentOptions(MedicalCaseDetail c, String currency, AsyncValue<InstallmentPlan>? planAsync) {
    final l10n = context.l10n;
    final plan = planAsync?.value ?? _plan;
    final unavailable = plan != null && !plan.installmentsAvailable;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OptionRadioCard(
          key: const ValueKey('option-full'),
          title: l10n.bookingPayInFull,
          subtitle: l10n.bookPayInFullSubtitle,
          selected: _option == PaymentOption.full,
          onTap: () => setState(() => _option = PaymentOption.full),
        ),
        OptionRadioCard(
          key: const ValueKey('option-deposit'),
          title: l10n.bookPayDeposit,
          subtitle: l10n.bookPayDepositSubtitle,
          selected: _option == PaymentOption.deposit,
          onTap: () => setState(() => _option = PaymentOption.deposit),
        ),
        OptionRadioCard(
          key: const ValueKey('option-installments'),
          title: l10n.bookMonthlyInstallments,
          subtitle: unavailable ? l10n.financingInstallmentsUnavailable : l10n.financingInstallmentsSubtitle,
          selected: _option == PaymentOption.installments && !unavailable,
          enabled: !unavailable,
          onTap: () => setState(() => _option = PaymentOption.installments),
          footer: _option != PaymentOption.installments || unavailable
              ? null
              : _installmentDetails(plan, planAsync, currency),
        ),
        if (plan?.partnerFinancingAvailable ?? false)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              key: const ValueKey('see-pay-later-partners'),
              style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
              onPressed: () => context.push(Routes.insuranceFor(tab: 'pay_later', caseId: c.id)),
              icon: const Icon(Icons.account_balance_wallet_outlined, size: 18),
              label: Text(l10n.financingSeePartners),
            ),
          ),
      ],
    );
  }

  /// Month chips (`allowed_months`), the schedule and the "interest-free, paid before admission" rule.
  Widget _installmentDetails(InstallmentPlan? plan, AsyncValue<InstallmentPlan>? planAsync, String currency) {
    final l10n = context.l10n;
    final muted = context.text.bodySmall?.copyWith(color: context.palette.textSecondary);
    if (_date == null) {
      return Text(l10n.financingPickDateFirst, key: const ValueKey('installments-pick-date'), style: muted);
    }
    if (plan == null) {
      if (planAsync != null && planAsync.hasError) {
        return ErrorView(error: planAsync.error, compact: true, onRetry: () => ref.invalidate(installmentPlanProvider));
      }
      return const LinearProgressIndicator(minHeight: 2);
    }
    final schedule = plan.months == _months ? plan.schedule : const <InstallmentRow>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final m in plan.allowedMonths)
              ChipToggle(
                key: ValueKey('months-$m'),
                label: l10n.bookMonths(m),
                selected: _months == m,
                selectedColor: AppColors.violet,
                onChanged: (_) => setState(() => _months = m),
              ),
          ],
        ),
        if (schedule.isNotEmpty) ...[
          const SizedBox(height: 10),
          for (final row in schedule)
            MergeSemantics(
              key: ValueKey('installment-row-${row.seq}'),
              child: Padding(
                padding: const EdgeInsetsDirectional.symmetric(vertical: 2),
                child: Row(
                  children: [
                    Expanded(child: Text(l10n.financingScheduleItem(row.seq, Dates.day(row.dueDate)), style: muted)),
                    const SizedBox(width: 8),
                    MoneyText(
                      row.amountMinor,
                      currency,
                      style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 4),
          Text(l10n.financingScheduleEstimate, style: muted),
        ],
        const SizedBox(height: 8),
        Text(
          l10n.financingInterestFreeNote(Dates.day(plan.admissionDate ?? _date)),
          key: const ValueKey('installments-interest-free'),
          style: context.text.bodySmall?.copyWith(fontWeight: FontWeight.w600),
        ),
      ],
    );
  }

  Future<void> _submit(MedicalCaseDetail c, {bool isRetry = false}) async {
    final date = _date;
    if (date == null || (_submitting && !isRetry)) return;
    setState(() => _submitting = true);
    try {
      final booking = await ref
          .read(bookingRepositoryProvider)
          .create(
            caseId: c.id,
            admissionDate: date,
            paymentOption: _option,
            quoteId: _quoteId,
            packageId: _quoteId == null ? _packageId : null,
            installmentMonths: _option == PaymentOption.installments ? _months : null,
            insuranceClaimRequested: _insurance,
          );
      ref.invalidate(caseDetailProvider(c.id));
      ref.invalidate(casesProvider);
      ref.invalidate(patientDashboardProvider);
      ref.invalidate(admissionAvailabilityProvider);
      if (!mounted) return;
      context.pushReplacement(Routes.pay(booking.id));
    } on ApiException catch (e) {
      if (!isRetry && mounted) {
        final gate = await handleBookingGate(context, e, caseId: c.id);
        if (gate == BookingGate.retry && mounted) return _submit(c, isRetry: true);
        if (gate != BookingGate.none) return;
      }
      if (e.code == 'date_unavailable' || e.code == 'no_capacity' || e.code == 'invalid_admission_date') {
        ref.invalidate(admissionAvailabilityProvider);
        setState(() => _date = null);
      }
      if (e.isInstallmentsPastTreatment) {
        // CG-18: the plan would end after admission; fall back to the longest allowed plan, else the deposit.
        final details = e.details;
        final max = details is Map ? int.tryParse('${details['max_months'] ?? ''}') : null;
        ref.invalidate(installmentPlanProvider);
        setState(() {
          if (max != null && max > 0) {
            _months = max;
          } else {
            _option = PaymentOption.deposit;
          }
        });
      }
      if (mounted) showErrorSnack(context, e);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

/// "Insurance options" with a short disclaimer, linking to the partner insurance screen.
class _InsuranceOptionsCard extends StatelessWidget {
  const _InsuranceOptionsCard({required this.caseId});

  final String caseId;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppCard(
      key: const ValueKey('insurance-options-card'),
      padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const ExcludeSemantics(child: Icon(Icons.health_and_safety_outlined, color: AppColors.info)),
              const SizedBox(width: 10),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    l10n.insuranceBookCardTitle,
                    style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            l10n.insuranceBookCardBody,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton(
              key: const ValueKey('open-insurance-options'),
              style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
              onPressed: () => context.push(Routes.insuranceFor(caseId: caseId)),
              child: Text(l10n.insuranceBookCardAction),
            ),
          ),
        ],
      ),
    );
  }
}

/// Price + "Save $500" column on a package card.
class _PriceColumn extends StatelessWidget {
  const _PriceColumn({required this.minor, required this.currency, this.savingsMinor = 0, this.display});

  final int minor;
  final String currency;
  final int savingsMinor;
  final DisplayMoney? display;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        MoneyText(minor, currency, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
        if (savingsMinor > 0)
          MoneyText(
            savingsMinor,
            currency,
            prefix: context.l10n.bookSavePrefix,
            style: context.text.labelMedium?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
          ),
        ApproxMoneyText(minor, currency, display: display),
      ],
    );
  }
}

/// Shown when the case already has an active booking (one booking per case).
class _ExistingBooking extends StatelessWidget {
  const _ExistingBooking({required this.booking, required this.caseId});

  final Booking booking;
  final String caseId;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(booking.bookingNumber, style: context.text.titleMedium)),
                  StatusBadge.forEnum(booking.status),
                ],
              ),
              const SizedBox(height: 8),
              Text('${booking.hospital.name}${booking.hospital.city == null ? '' : ', ${booking.hospital.city}'}'),
              if (booking.admissionDate != null)
                Text(
                  l10n.bookingAdmissionDate(Dates.day(booking.admissionDate)),
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              const SizedBox(height: 12),
              Text(l10n.bookExistingBookingBody, style: context.text.bodyMedium),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (booking.balanceDueMinor > 0)
          PrimaryButton(
            label: l10n.bookContinueToPayment,
            tone: ButtonTone.violet,
            onPressed: () => context.pushReplacement(Routes.pay(booking.id)),
          ),
        const SizedBox(height: 10),
        SecondaryButton(label: l10n.caseViewCase, onPressed: () => context.pushReplacement(Routes.caseDetail(caseId))),
      ],
    );
  }
}
