import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../agent_portal/shared/portal_widgets.dart';
import '../../trips/services/file_actions.dart';
import '../data/hospital_models.dart';
import '../data/hospital_repository.dart';
import '../hospital_routes.dart';

// ------------------------------------------------------------------------------------------ inbox

/// Enquiries inbox: cases sent to the hospital, filtered by status (open enquiries first).
class EnquiriesScreen extends ConsumerStatefulWidget {
  const EnquiriesScreen({super.key});

  @override
  ConsumerState<EnquiriesScreen> createState() => _EnquiriesScreenState();
}

class _EnquiriesScreenState extends ConsumerState<EnquiriesScreen> {
  CaseStatus? _status = CaseStatus.enquiry;

  @override
  Widget build(BuildContext context) {
    final cases = ref.watch(hospitalCasesProvider(_status));
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.hpTabEnquiries)),
      body: Column(
        children: [
          StatusFilterBar<CaseStatus>(
            options: const [
              CaseStatus.enquiry,
              CaseStatus.quoted,
              CaseStatus.accepted,
              CaseStatus.booked,
              CaseStatus.inTreatment,
              CaseStatus.completed,
              CaseStatus.declined,
              CaseStatus.cancelled,
            ],
            selected: _status,
            labelOf: (s) => s == CaseStatus.enquiry ? l10n.hpEnquiriesFilterNew : s.label,
            onSelected: (s) => setState(() => _status = s),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(hospitalCasesProvider(_status)),
              child: AsyncValueView(
                value: cases,
                onRetry: () => ref.invalidate(hospitalCasesProvider(_status)),
                data: (page) => page.items.isEmpty
                    ? ListView(
                        children: [
                          EmptyView(
                            title: _status == CaseStatus.enquiry ? l10n.hpNoNewEnquiries : l10n.hpNoCases,
                            message: l10n.hpEnquiriesEmptyMessage,
                            icon: Icons.inbox_outlined,
                          ),
                        ],
                      )
                    : ListView(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                        children: [
                          for (final c in page.items)
                            CaseTile(
                              medicalCase: c,
                              showHospital: false,
                              onTap: () => context.push(HospitalRoutes.caseDetail(c.id)),
                            ),
                        ],
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------- detail

/// Case detail for hospital staff: patient & screening, documents, quotes, quote / decline actions.
class HospitalCaseDetailScreen extends ConsumerStatefulWidget {
  const HospitalCaseDetailScreen({super.key, required this.caseId});

  final String caseId;

  @override
  ConsumerState<HospitalCaseDetailScreen> createState() => _HospitalCaseDetailScreenState();
}

class _HospitalCaseDetailScreenState extends ConsumerState<HospitalCaseDetailScreen> {
  bool _busy = false;

  Future<void> _decline(MedicalCaseDetail c) async {
    final l10n = context.l10n;
    final note = await promptText(
      context,
      title: l10n.hpDeclineTitle(c.caseNumber),
      label: l10n.hpDeclineReasonLabel,
      confirmLabel: l10n.hpDeclineButton,
      required: true,
      maxLines: 3,
    );
    if (note == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(hospitalRepositoryProvider).declineCase(c.id, note: note);
      ref
        ..invalidate(hospitalCaseDetailProvider(c.id))
        ..invalidate(hospitalCasesProvider)
        ..invalidate(hospitalDashboardProvider);
      if (mounted) showInfoSnack(context, context.l10n.hpEnquiryDeclined);
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(hospitalCaseDetailProvider(widget.caseId));
    final c = detail.value;
    final canQuote = c != null && (c.status == CaseStatus.enquiry || c.status == CaseStatus.quoted);
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(c?.caseNumber ?? l10n.hpCaseFallbackTitle)),
      bottomNavigationBar: !canQuote
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: SecondaryButton(
                        label: l10n.hpDeclineButton,
                        foregroundColor: AppColors.danger,
                        borderColor: AppColors.danger,
                        onPressed: _busy ? null : () => _decline(c),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: PrimaryButton(
                        key: const ValueKey('hospital-prepare-quote'),
                        label: c.quotes.isEmpty ? l10n.hpPrepareQuote : l10n.hpSendRevisedQuote,
                        icon: Icons.request_quote_outlined,
                        onPressed: _busy ? null : () => context.push(HospitalRoutes.quoteBuilder(c.id)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
      body: AsyncValueView(
        value: detail,
        onRetry: () => ref.invalidate(hospitalCaseDetailProvider(widget.caseId)),
        data: (c) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(hospitalCaseDetailProvider(widget.caseId)),
          child: ListView(padding: AppSpacing.pageAll, children: _body(c)),
        ),
      ),
    );
  }

  List<Widget> _body(MedicalCaseDetail c) {
    final p = c.patient;
    final s = c.screening;
    final l10n = context.l10n;
    return [
      AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Avatar(name: p?.fullName ?? ''),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p?.fullName ?? l10n.hpPatientFallback,
                        style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        [
                          ?p?.nationality,
                          ?p?.gender?.label,
                          if (p?.age != null) l10n.hpYearsShort(p!.age!),
                        ].join(' · '),
                        style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                      ),
                    ],
                  ),
                ),
                StatusBadge.forEnum(c.status),
              ],
            ),
            const Divider(height: 24),
            InfoRow(l10n.hpInfoTreatment, c.title),
            InfoRow(l10n.hpInfoDoctor, c.doctor?.fullName),
            InfoRow(l10n.hpInfoViaAgent, c.agent?.agencyName),
            InfoRow(l10n.hpInfoCoordinator, c.coordinator?.fullName),
            InfoRow(l10n.hpInfoReceived, Dates.dayTime(c.createdAt)),
          ],
        ),
      ),
      if (c.booking != null) ...[
        const SizedBox(height: 12),
        AppCard(
          onTap: () => context.push(HospitalRoutes.booking(c.booking!.id)),
          child: Row(
            children: [
              const Icon(Icons.event_available_rounded, color: AppColors.violet),
              const SizedBox(width: 12),
              Expanded(
                child: Text(l10n.hpCaseBookingLine(c.booking!.bookingNumber, Dates.day(c.booking!.admissionDate))),
              ),
              StatusBadge.forEnum(c.booking!.status, dense: true),
            ],
          ),
        ),
      ],
      if ((c.patientNotes ?? '').isNotEmpty || (c.medicalSummary ?? '').isNotEmpty) ...[
        SectionTitle(l10n.hpPatientNotes),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if ((c.patientNotes ?? '').isNotEmpty) Text(c.patientNotes!),
              if ((c.medicalSummary ?? '').isNotEmpty) ...[
                if ((c.patientNotes ?? '').isNotEmpty) const Divider(height: 20),
                Text(c.medicalSummary!),
              ],
            ],
          ),
        ),
      ],
      if (s != null) ...[
        SectionTitle(l10n.hpScreening),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (s.aiResult != null) ...[Text(s.aiResult!.summary), const Divider(height: 20)],
              InfoRow(l10n.hpInfoSpecialty, s.specialty?.name),
              InfoRow(l10n.hpInfoBodyAreas, s.bodyAreas.map(humanizeEnumValue).join(', ')),
              InfoRow(l10n.hpInfoPain, s.painIntensity == null ? null : '${s.painIntensity}/10'),
              InfoRow(
                l10n.hpInfoSymptoms,
                s.symptoms.where((x) => x.answer != SymptomAnswer.no).map((x) => x.name).join(', '),
              ),
              InfoRow(
                l10n.hpInfoDuration,
                s.durationValue == null ? null : '${s.durationValue} ${s.durationUnit?.label.toLowerCase() ?? ''}',
              ),
              if (s.urgency != null)
                InfoRow(
                  l10n.hpInfoUrgency,
                  null,
                  valueWidget: Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: StatusBadge.forEnum(s.urgency!, dense: true),
                  ),
                ),
              for (final f in s.redFlags)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('⚠ $f', style: const TextStyle(color: AppColors.danger)),
                ),
            ],
          ),
        ),
      ],
      if (c.documents.isNotEmpty) ...[
        SectionTitle(l10n.hpMedicalDocuments),
        for (final d in c.documents)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(d.isPdf ? Icons.picture_as_pdf_outlined : Icons.description_outlined),
            title: Text(d.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${d.kind.label} · ${d.sizeLabel}'),
            trailing: IconButton(
              tooltip: l10n.commonDownload,
              icon: const Icon(Icons.download_rounded),
              onPressed: () => downloadDocument(context, ref.read(documentRepositoryProvider), d),
            ),
          ),
      ],
      SectionTitle(l10n.hpQuotesSection),
      if (c.quotes.isEmpty)
        Text(l10n.hpNoQuoteYet, style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary))
      else
        for (final q in c.quotes)
          AppCard(
            margin: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(l10n.hpQuoteSentOn(Dates.day(q.createdAt)), style: context.text.labelLarge)),
                    StatusBadge.forEnum(q.status, dense: true),
                  ],
                ),
                const SizedBox(height: 10),
                QuoteBreakdown(quote: q),
              ],
            ),
          ),
      const SizedBox(height: 24),
    ];
  }
}

// ---------------------------------------------------------------------------------- quote builder

/// Itemised quote builder (`POST /cases/{id}/quotes`).
class QuoteBuilderScreen extends ConsumerStatefulWidget {
  const QuoteBuilderScreen({super.key, required this.caseId});

  final String caseId;

  @override
  ConsumerState<QuoteBuilderScreen> createState() => _QuoteBuilderScreenState();
}

class _LineControllers {
  _LineControllers(this.line)
    : description = TextEditingController(text: line.description),
      amount = TextEditingController();

  final QuoteLineDraft line;
  final TextEditingController description;
  final TextEditingController amount;

  void dispose() {
    description.dispose();
    amount.dispose();
  }
}

class _QuoteBuilderScreenState extends ConsumerState<QuoteBuilderScreen> {
  final _plan = TextEditingController();
  final _stay = TextEditingController();
  String _currency = 'INR';
  late DateTime _validUntil = DateTime.now().add(const Duration(days: 30));
  final List<_LineControllers> _lines = [
    _LineControllers(QuoteLineDraft(category: QuoteLineCategory.surgery)),
    _LineControllers(QuoteLineDraft(category: QuoteLineCategory.hospitalStay)),
  ];
  bool _sending = false;
  bool _prefilled = false;

  @override
  void dispose() {
    _plan.dispose();
    _stay.dispose();
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  /// Seeds the form from the latest quote (revisions) or the hospital's price list.
  void _prefill(MedicalCaseDetail c, List<HospitalProcedure> priceList) {
    if (_prefilled) return;
    _prefilled = true;
    final last = c.latestQuote;
    if (last != null) {
      _plan.text = last.treatmentPlan ?? '';
      _currency = last.currency;
      if (last.estimatedStayDays != null) _stay.text = '${last.estimatedStayDays}';
      for (final l in _lines) {
        l.dispose();
      }
      _lines
        ..clear()
        ..addAll([
          for (final li in last.lineItems)
            _LineControllers(
              QuoteLineDraft(category: li.category, description: li.description, amountMinor: li.amountMinor),
            )..amount.text = _major(li.amountMinor, last.currency),
        ]);
      return;
    }
    final hp = priceList.where((p) => p.procedure.id == c.procedure?.id).firstOrNull;
    if (hp != null) {
      _currency = hp.currency;
      if (hp.hospitalStayDays != null) _stay.text = '${hp.hospitalStayDays}';
      _lines.first
        ..line.description = hp.procedure.name
        ..description.text = hp.procedure.name
        ..line.amountMinor = hp.priceMinMinor
        ..amount.text = _major(hp.priceMinMinor, hp.currency);
    }
    _plan.text = c.procedure == null ? '' : '${c.procedure!.name} — ';
  }

  String _major(int minor, String ccy) {
    final v = minorToMajor(minor, ccy);
    return v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(Currencies.exponent(ccy));
  }

  void _syncAmounts() {
    for (final l in _lines) {
      final v = double.tryParse(l.amount.text.replaceAll(',', '').trim()) ?? 0;
      l.line
        ..amountMinor = majorToMinor(v < 0 ? 0 : v, _currency)
        ..description = l.description.text;
    }
  }

  QuoteDraft _draft() {
    _syncAmounts();
    return QuoteDraft(
      treatmentPlan: _plan.text,
      lines: [for (final l in _lines) l.line],
      currency: _currency,
      validUntil: _validUntil,
      estimatedStayDays: int.tryParse(_stay.text.trim()),
    );
  }

  Future<void> _send() async {
    final draft = _draft();
    final l10n = context.l10n;
    final problem = draft.problemIn(l10n);
    if (problem != null) {
      showInfoSnack(context, problem);
      return;
    }
    final ok = await confirmAction(
      context,
      title: l10n.hpSendQuoteConfirmTitle,
      message: l10n.hpSendQuoteConfirmMessage(money(draft.totalMinor, draft.currency)),
      confirmLabel: l10n.commonSend,
    );
    if (!ok || !mounted) return;
    setState(() => _sending = true);
    try {
      await ref.read(hospitalRepositoryProvider).submitQuote(widget.caseId, draft);
      ref
        ..invalidate(hospitalCaseDetailProvider(widget.caseId))
        ..invalidate(hospitalCasesProvider)
        ..invalidate(hospitalDashboardProvider);
      if (mounted) {
        showInfoSnack(context, context.l10n.hpQuoteSent);
        context.pop();
      }
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(hospitalCaseDetailProvider(widget.caseId));
    final priceList = ref.watch(hospitalProceduresProvider);
    if (detail.hasValue && !priceList.isLoading) {
      _prefill(detail.requireValue, priceList.value ?? const []);
    }
    final l10n = context.l10n;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.hpQuoteBuilderTitle(detail.value?.caseNumber ?? ''))),
      body: AsyncValueView(
        value: detail,
        onRetry: () => ref.invalidate(hospitalCaseDetailProvider(widget.caseId)),
        // Form fields mount only once the price list resolved, so prefilling never edits live fields.
        data: (c) => priceList.isLoading
            ? const LoadingView()
            : ListView(
                padding: AppSpacing.pageAll,
                children: [
                  Text(
                    '${c.patient?.fullName ?? l10n.hpPatientFallback} · ${c.title}',
                    style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const ValueKey('quote-plan'),
                    controller: _plan,
                    maxLines: 4,
                    decoration: InputDecoration(labelText: l10n.hpTreatmentPlanLabel),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _currency,
                          decoration: InputDecoration(labelText: l10n.hpCurrencyLabel),
                          items: [
                            for (final ccy in {...Currencies.supported, _currency})
                              DropdownMenuItem(value: ccy, child: Text(ccy)),
                          ],
                          onChanged: (v) => setState(() => _currency = v ?? _currency),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          controller: _stay,
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                          decoration: InputDecoration(labelText: l10n.hpStayDaysLabel),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.event_outlined),
                    title: Text(l10n.hpValidUntil(Dates.day(_validUntil))),
                    trailing: const Icon(Icons.edit_calendar_outlined),
                    onTap: () async {
                      final now = DateTime.now();
                      final d = await showDatePicker(
                        context: context,
                        initialDate: _validUntil,
                        firstDate: now,
                        lastDate: now.add(const Duration(days: 365)),
                      );
                      if (d != null) setState(() => _validUntil = d);
                    },
                  ),
                  SectionTitle(l10n.hpLineItems),
                  for (var i = 0; i < _lines.length; i++) _lineEditor(i),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton.icon(
                      key: const ValueKey('quote-add-line'),
                      onPressed: _lines.length >= 50
                          ? null
                          : () => setState(
                              () => _lines.add(_LineControllers(QuoteLineDraft(category: QuoteLineCategory.other))),
                            ),
                      icon: const Icon(Icons.add_rounded),
                      label: Text(l10n.hpAddLineItem),
                    ),
                  ),
                  const Divider(height: 24),
                  Builder(
                    builder: (context) {
                      _syncAmounts();
                      final total = _lines.fold<int>(0, (s, l) => s + l.line.amountMinor);
                      return Row(
                        children: [
                          Expanded(child: Text(l10n.hpTotal, style: context.text.titleMedium)),
                          Text(
                            money(total, _currency),
                            key: const ValueKey('quote-total'),
                            style: context.text.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary,
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                  const SizedBox(height: 20),
                  PrimaryButton(
                    key: const ValueKey('quote-send'),
                    label: l10n.hpSendQuote,
                    icon: Icons.send_rounded,
                    loading: _sending,
                    onPressed: _sending ? null : _send,
                  ),
                ],
              ),
      ),
    );
  }

  Widget _lineEditor(int i) {
    final l = _lines[i];
    final l10n = context.l10n;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsetsDirectional.fromSTEB(12, 8, 4, 8),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<QuoteLineCategory>(
                  initialValue: l.line.category,
                  isDense: true,
                  decoration: InputDecoration(labelText: l10n.hpCategoryLabel),
                  items: [for (final c in QuoteLineCategory.values) DropdownMenuItem(value: c, child: Text(c.label))],
                  onChanged: (v) => setState(() => l.line.category = v ?? l.line.category),
                ),
              ),
              IconButton(
                tooltip: l10n.commonRemove,
                onPressed: _lines.length <= 1
                    ? null
                    : () => setState(() {
                        _lines.removeAt(i).dispose();
                      }),
                icon: const Icon(Icons.delete_outline_rounded),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                flex: 3,
                child: TextField(
                  key: ValueKey('quote-line-desc-$i'),
                  controller: l.description,
                  decoration: InputDecoration(labelText: l10n.hpDescriptionLabel),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: TextField(
                  key: ValueKey('quote-line-amount-$i'),
                  controller: l.amount,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                  decoration: InputDecoration(labelText: l10n.hpAmountLabel(_currency)),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 8),
            ],
          ),
        ],
      ),
    );
  }
}
