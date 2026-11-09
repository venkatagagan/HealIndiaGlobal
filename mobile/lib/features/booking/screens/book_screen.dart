import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/booking_repository.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
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
  static const _installmentChoices = [3, 6, 12];

  late DateTime _month;
  DateTime? _date;
  String? _packageId;
  String? _quoteId;
  bool _selectionResolved = false;
  PaymentOption _option = PaymentOption.full;
  int _months = 6;
  bool _insurance = false;
  bool _submitting = false;

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
      appBar: AppBar(title: const Text('Select Dates'), centerTitle: true),
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
              title: 'This case is ${c.status.label.toLowerCase()}',
              message: 'Open a new enquiry to book treatment.',
              actionLabel: 'View case',
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
                label: 'Proceed to Payment',
                tone: ButtonTone.violet,
                loading: _submitting,
                onPressed: _canSubmit ? () => _submit(caseAsync.value!) : null,
              ),
            ),
    );
  }

  bool _hasActiveBooking(MedicalCaseDetail c) =>
      (c.booking != null && c.booking!.status != BookingStatus.cancelled) || !c.isOpen;

  bool get _canSubmit => _date != null && (_packageId != null || _quoteId != null);

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
        ? formatStayRange(selectedQuote!.estimatedStayDays, null)
        : (procedure != null
              ? formatStayRange(procedure.hospitalStayDays, procedure.totalStayDays)
              : formatStayRange(selectedPkg?.hospitalProcedure.hospitalStayDays, null));

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
            text: 'Treatment duration: ',
            style: context.text.bodyMedium?.copyWith(color: context.palette.textSecondary),
            children: [
              TextSpan(
                text: duration == null ? 'confirmed by the hospital' : '$duration required',
                style: TextStyle(color: context.colors.onSurface, fontWeight: FontWeight.w700),
              ),
            ],
          ),
          textAlign: TextAlign.center,
        ),
        if (_date != null) ...[
          const SizedBox(height: 4),
          Text(
            'Admission on ${Dates.weekday(_date)} ${_date!.year}',
            textAlign: TextAlign.center,
            style: context.text.bodySmall?.copyWith(color: AppColors.violet, fontWeight: FontWeight.w600),
          ),
        ],
        const SectionTitle('Select Package'),
        if (accepted != null)
          OptionRadioCard(
            key: ValueKey('quote-${accepted.id}'),
            title: 'Accepted hospital quote',
            subtitle: [
              if (accepted.estimatedStayDays != null) '${accepted.estimatedStayDays} days stay',
              if (accepted.validUntil != null) 'valid until ${Dates.day(accepted.validUntil)}',
              if (accepted.lineItems.isNotEmpty) '${accepted.lineItems.length} itemized charges',
            ].join(' · '),
            selected: _quoteId == accepted.id,
            onTap: () => setState(() {
              _quoteId = accepted.id;
              _packageId = null;
            }),
            trailing: _PriceColumn(minor: accepted.totalMinor, currency: accepted.currency),
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
          AppCard(
            child: Text(
              'This hospital has not published packages for this treatment yet. '
              'Ask for a personalised quote from your case page.',
              style: context.text.bodyMedium,
            ),
          ),
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
            ),
          ),
        const SectionTitle('Payment Option'),
        _paymentOptions(priceMinor, priceCcy),
        const SizedBox(height: 8),
        CheckboxListTile(
          key: const ValueKey('insurance-claim'),
          contentPadding: EdgeInsets.zero,
          value: _insurance,
          onChanged: (v) => setState(() => _insurance = v ?? false),
          title: const Text('I want to claim insurance'),
          subtitle: Text(
            'Our team will help you with the claim paperwork.',
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          controlAffinity: ListTileControlAffinity.trailing,
        ),
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
        dot(AppColors.primary, 'Available'),
        dot(AppColors.violet, 'Selected'),
        dot(context.palette.textMuted, availability?.restricted ?? true ? 'Unavailable' : 'Past'),
      ],
    );
  }

  String _packageSubtitle(TreatmentPackage pkg, String? procedureName) {
    final parts = <String>[
      ?procedureName,
      if (pkg.description != null && pkg.description!.isNotEmpty) pkg.description!,
      if (pkg.description == null || pkg.description!.isEmpty)
        switch (pkg.tier) {
          PackageTier.medicalOnly => 'Core treatment package',
          PackageTier.medicalStay => 'Treatment + accommodation',
          PackageTier.allInclusive => 'Treatment, stay, transfers & translator',
        },
    ];
    final bullets = pkg.includes.bullets;
    if (bullets.isNotEmpty) parts.add(bullets.take(3).join(', '));
    return parts.join('\n');
  }

  Widget _paymentOptions(int? priceMinor, String currency) {
    String? perMonth() {
      if (priceMinor == null || priceMinor <= 0) return null;
      return '≈ ${formatMoney((priceMinor / _months).ceil(), currency)} / month before fees';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OptionRadioCard(
          key: const ValueKey('option-full'),
          title: 'Pay in full',
          subtitle: 'One payment for the whole treatment',
          selected: _option == PaymentOption.full,
          onTap: () => setState(() => _option = PaymentOption.full),
        ),
        OptionRadioCard(
          key: const ValueKey('option-deposit'),
          title: 'Pay a deposit now',
          subtitle: 'Secure your date; the balance is due before admission',
          selected: _option == PaymentOption.deposit,
          onTap: () => setState(() => _option = PaymentOption.deposit),
        ),
        OptionRadioCard(
          key: const ValueKey('option-installments'),
          title: 'Monthly installments',
          subtitle: '3, 6 or 12 months',
          selected: _option == PaymentOption.installments,
          onTap: () => setState(() => _option = PaymentOption.installments),
          footer: _option != PaymentOption.installments
              ? null
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final m in _installmentChoices)
                          ChipToggle(
                            key: ValueKey('months-$m'),
                            label: '$m months',
                            selected: _months == m,
                            selectedColor: AppColors.violet,
                            onChanged: (_) => setState(() => _months = m),
                          ),
                      ],
                    ),
                    if (perMonth() != null) ...[
                      const SizedBox(height: 8),
                      Text(perMonth()!, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary)),
                    ],
                  ],
                ),
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
      if (mounted) showErrorSnack(context, e);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

/// Price + "Save $500" column on a package card.
class _PriceColumn extends StatelessWidget {
  const _PriceColumn({required this.minor, required this.currency, this.savingsMinor = 0});

  final int minor;
  final String currency;
  final int savingsMinor;

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
            prefix: 'Save ',
            style: context.text.labelMedium?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700),
          ),
        ApproxMoneyText(minor, currency),
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
                  'Admission ${Dates.day(booking.admissionDate)}',
                  style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                ),
              const SizedBox(height: 12),
              Text(
                'This case already has a booking. Continue with it, or cancel it from the case page to choose new dates.',
                style: context.text.bodyMedium,
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        if (booking.balanceDueMinor > 0)
          PrimaryButton(
            label: 'Continue to payment',
            tone: ButtonTone.violet,
            onPressed: () => context.pushReplacement(Routes.pay(booking.id)),
          ),
        const SizedBox(height: 10),
        SecondaryButton(label: 'View case', onPressed: () => context.pushReplacement(Routes.caseDetail(caseId))),
      ],
    );
  }
}
