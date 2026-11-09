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
    return Scaffold(
      appBar: AppBar(title: const Text('Enquiries')),
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
            labelOf: (s) => s == CaseStatus.enquiry ? 'New' : s.label,
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
                            title: _status == CaseStatus.enquiry ? 'No new enquiries' : 'No cases',
                            message: 'Patients and agents send enquiries from the matching results.',
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
    final note = await promptText(
      context,
      title: 'Decline ${c.caseNumber}?',
      label: 'Reason shared with the patient',
      confirmLabel: 'Decline',
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
      if (mounted) showInfoSnack(context, 'Enquiry declined');
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
    return Scaffold(
      appBar: AppBar(title: Text(c?.caseNumber ?? 'Case')),
      bottomNavigationBar: !canQuote
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: SecondaryButton(
                        label: 'Decline',
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
                        label: c.quotes.isEmpty ? 'Prepare quote' : 'Send revised quote',
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
                        p?.fullName ?? 'Patient',
                        style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        [?p?.nationality, ?p?.gender?.label, if (p?.age != null) '${p!.age} yrs'].join(' · '),
                        style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                      ),
                    ],
                  ),
                ),
                StatusBadge.forEnum(c.status),
              ],
            ),
            const Divider(height: 24),
            InfoRow('Treatment', c.title),
            InfoRow('Doctor', c.doctor?.fullName),
            InfoRow('Via agent', c.agent?.agencyName),
            InfoRow('Coordinator', c.coordinator?.fullName),
            InfoRow('Received', Dates.dayTime(c.createdAt)),
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
                child: Text('Booking ${c.booking!.bookingNumber} · admission ${Dates.day(c.booking!.admissionDate)}'),
              ),
              StatusBadge.forEnum(c.booking!.status, dense: true),
            ],
          ),
        ),
      ],
      if ((c.patientNotes ?? '').isNotEmpty || (c.medicalSummary ?? '').isNotEmpty) ...[
        const SectionTitle('Patient notes'),
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
        const SectionTitle('Screening'),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (s.aiResult != null) ...[Text(s.aiResult!.summary), const Divider(height: 20)],
              InfoRow('Specialty', s.specialty?.name),
              InfoRow('Body areas', s.bodyAreas.map(humanizeEnumValue).join(', ')),
              InfoRow('Pain', s.painIntensity == null ? null : '${s.painIntensity}/10'),
              InfoRow('Symptoms', s.symptoms.where((x) => x.answer != SymptomAnswer.no).map((x) => x.name).join(', ')),
              InfoRow(
                'Duration',
                s.durationValue == null ? null : '${s.durationValue} ${s.durationUnit?.label.toLowerCase() ?? ''}',
              ),
              if (s.urgency != null)
                InfoRow(
                  'Urgency',
                  null,
                  valueWidget: Align(
                    alignment: Alignment.centerLeft,
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
        const SectionTitle('Medical documents'),
        for (final d in c.documents)
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(d.isPdf ? Icons.picture_as_pdf_outlined : Icons.description_outlined),
            title: Text(d.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
            subtitle: Text('${d.kind.label} · ${d.sizeLabel}'),
            trailing: IconButton(
              tooltip: 'Download',
              icon: const Icon(Icons.download_rounded),
              onPressed: () => downloadDocument(context, ref.read(documentRepositoryProvider), d),
            ),
          ),
      ],
      const SectionTitle('Quotes'),
      if (c.quotes.isEmpty)
        Text('No quote sent yet.', style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary))
      else
        for (final q in c.quotes)
          AppCard(
            margin: const EdgeInsets.only(bottom: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(child: Text('Sent ${Dates.day(q.createdAt)}', style: context.text.labelLarge)),
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
    final problem = draft.problem;
    if (problem != null) {
      showInfoSnack(context, problem);
      return;
    }
    final ok = await confirmAction(
      context,
      title: 'Send quote?',
      message: 'Total ${money(draft.totalMinor, draft.currency)} — the patient is notified immediately.',
      confirmLabel: 'Send',
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
        showInfoSnack(context, 'Quote sent');
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
    return Scaffold(
      appBar: AppBar(title: Text('Quote · ${detail.value?.caseNumber ?? ''}')),
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
                    '${c.patient?.fullName ?? 'Patient'} · ${c.title}',
                    style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    key: const ValueKey('quote-plan'),
                    controller: _plan,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'Treatment plan'),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: DropdownButtonFormField<String>(
                          initialValue: _currency,
                          decoration: const InputDecoration(labelText: 'Currency'),
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
                          decoration: const InputDecoration(labelText: 'Stay (days)'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.event_outlined),
                    title: Text('Valid until ${Dates.day(_validUntil)}'),
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
                  const SectionTitle('Line items'),
                  for (var i = 0; i < _lines.length; i++) _lineEditor(i),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton.icon(
                      key: const ValueKey('quote-add-line'),
                      onPressed: _lines.length >= 50
                          ? null
                          : () => setState(
                              () => _lines.add(_LineControllers(QuoteLineDraft(category: QuoteLineCategory.other))),
                            ),
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Add line item'),
                    ),
                  ),
                  const Divider(height: 24),
                  Builder(
                    builder: (context) {
                      _syncAmounts();
                      final total = _lines.fold<int>(0, (s, l) => s + l.line.amountMinor);
                      return Row(
                        children: [
                          Expanded(child: Text('Total', style: context.text.titleMedium)),
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
                    label: 'Send quote',
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
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<QuoteLineCategory>(
                  initialValue: l.line.category,
                  isDense: true,
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: [for (final c in QuoteLineCategory.values) DropdownMenuItem(value: c, child: Text(c.label))],
                  onChanged: (v) => setState(() => l.line.category = v ?? l.line.category),
                ),
              ),
              IconButton(
                tooltip: 'Remove',
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
                  decoration: const InputDecoration(labelText: 'Description'),
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
                  decoration: InputDecoration(labelText: 'Amount ($_currency)'),
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
