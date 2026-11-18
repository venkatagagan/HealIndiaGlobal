import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_repository.dart';
import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/repositories/case_repository.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../trips/services/file_actions.dart';

/// Picks one report file (PDF / image). Overridden in widget tests.
final reportFilePickerProvider = Provider<Future<PickedFile?> Function()>((ref) => pickDocumentFile);

/// Quick quote: up to three hospitals, the treatment, reports to share (existing or new upload), notes and
/// consent, then `POST /cases/quote-request` (or `POST /cases` for a request to one named doctor). Opens the
/// side-by-side quote comparison with the "Quotes due by" countdown.
///
/// Route: `/quote/new?hospitals=&procedure=&procedure_id=&doctor=&specialty=&screening=`.
class QuickQuoteScreen extends ConsumerStatefulWidget {
  const QuickQuoteScreen({
    super.key,
    required this.hospitalIds,
    this.procedureSlug,
    this.procedureId,
    this.doctorId,
    this.specialtyId,
    this.screeningId,
  });

  final List<String> hospitalIds;
  final String? procedureSlug;
  final String? procedureId;
  final String? doctorId;
  final String? specialtyId;
  final String? screeningId;

  @override
  ConsumerState<QuickQuoteScreen> createState() => _QuickQuoteScreenState();
}

class _QuickQuoteScreenState extends ConsumerState<QuickQuoteScreen> {
  late final List<String> _hospitals = widget.hospitalIds.take(CaseRepository.maxQuoteHospitals).toList();
  final _notes = TextEditingController();
  final Set<String> _documentIds = {};
  final List<AppDocument> _uploaded = [];
  String? _procedureId;
  bool _consent = false;
  bool _busy = false;
  bool _uploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _procedureId = widget.procedureId;
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  bool get _singleDoctor => widget.doctorId != null && _hospitals.length == 1;

  Future<void> _addHospital() async {
    final picked = await showModalBottomSheet<HospitalCard>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _HospitalPicker(procedureSlug: widget.procedureSlug, exclude: _hospitals.toSet()),
    );
    if (picked != null && mounted) setState(() => _hospitals.add(picked.id));
  }

  Future<void> _upload() async {
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final file = await ref.read(reportFilePickerProvider)();
      if (file == null) return;
      final doc = await ref
          .read(documentRepositoryProvider)
          .upload(fileName: file.name, bytes: file.bytes, kind: DocumentKind.medicalReport);
      if (!mounted) return;
      setState(() {
        _uploaded.add(doc);
        _documentIds.add(doc.id);
      });
    } on Object catch (e) {
      if (mounted) setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _submit(String? procedureId) async {
    if (!_consent || _busy || _hospitals.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).recordConsent(kind: ConsentKind.shareWithHospitals, granted: true);
      final cases = ref.read(caseRepositoryProvider);
      final notes = _notes.text.trim();
      if (_singleDoctor) {
        final created = await cases.create(
          hospitalId: _hospitals.single,
          doctorId: widget.doctorId,
          procedureId: procedureId,
          specialtyId: widget.specialtyId,
          screeningId: widget.screeningId,
          patientNotes: notes,
          documentIds: _documentIds.toList(),
        );
        ref.invalidate(casesProvider);
        if (!mounted) return;
        showInfoSnack(context, context.l10n.quoteRequestedSnack);
        context.pushReplacement(Routes.caseDetail(created.id));
        return;
      }
      final group = await cases.requestQuotes(
        hospitalIds: _hospitals,
        procedureId: procedureId,
        specialtyId: procedureId == null ? widget.specialtyId : null,
        screeningId: widget.screeningId,
        notes: notes,
        documentIds: _documentIds.toList(),
      );
      ref.invalidate(casesProvider);
      if (!mounted) return;
      showInfoSnack(context, context.l10n.quoteRequestedSnack);
      context.pushReplacement(Routes.quoteGroup(group.id));
    } on Object catch (e) {
      if (!mounted) return;
      if (await handleGuardianConsentError(context, e)) return;
      if (!mounted) return;
      setState(() => _error = errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final procedure = widget.procedureSlug == null
        ? null
        : ref.watch(procedureDetailProvider(widget.procedureSlug!)).value;
    final first = _hospitals.isEmpty ? null : ref.watch(hospitalDetailProvider(_hospitals.first)).value;
    final procedureId = procedure?.id ?? _procedureId;
    final docs = ref.watch(documentsProvider((caseId: null, kind: null))).value ?? const <AppDocument>[];
    final allDocs = {
      for (final d in [..._uploaded, ...docs]) d.id: d,
    }.values.toList();
    final names = [
      for (final id in _hospitals) ref.watch(hospitalDetailProvider(id)).value?.name ?? '',
    ].where((n) => n.isNotEmpty).toList();

    return Scaffold(
      appBar: AppBar(title: Text(l10n.quoteSheetTitle)),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: PrimaryButton(
          key: const ValueKey('quick-quote-submit'),
          label: _singleDoctor || _hospitals.length == 1
              ? l10n.quoteSendRequest
              : l10n.quickQuoteSendTo(_hospitals.length),
          icon: Icons.send_rounded,
          loading: _busy,
          onPressed: _consent && _hospitals.isNotEmpty ? () => _submit(procedureId) : null,
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          AppCard(
            color: AppColors.primary.withValues(alpha: 0.10),
            borderColor: AppColors.primary.withValues(alpha: 0.35),
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                const Icon(Icons.timer_outlined, color: AppColors.primary),
                const SizedBox(width: 10),
                Expanded(child: Text(l10n.quickQuoteSlaNote, style: context.text.bodySmall)),
              ],
            ),
          ),
          SectionTitle(
            l10n.quickQuoteHospitals(_hospitals.length, CaseRepository.maxQuoteHospitals),
            padding: const EdgeInsets.only(top: 16, bottom: 8),
          ),
          for (final id in _hospitals)
            _HospitalRow(
              hospitalId: id,
              onRemove: _hospitals.length > 1 ? () => setState(() => _hospitals.remove(id)) : null,
            ),
          if (_hospitals.length < CaseRepository.maxQuoteHospitals && widget.doctorId == null)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                key: const ValueKey('quick-quote-add-hospital'),
                icon: const Icon(Icons.add_circle_outline_rounded),
                label: Text(l10n.quickQuoteAddHospital),
                onPressed: _addHospital,
              ),
            ),
          SectionTitle(l10n.quoteTreatmentLabel, padding: const EdgeInsets.only(top: 12, bottom: 8)),
          if (procedure != null)
            Text(procedure.name, style: context.text.titleSmall)
          else if (first != null && first.procedures.isNotEmpty)
            DropdownButtonFormField<String?>(
              initialValue: _procedureId,
              isExpanded: true,
              decoration: InputDecoration(labelText: l10n.quoteTreatmentLabel),
              items: [
                DropdownMenuItem<String?>(value: null, child: Text(l10n.quoteTreatmentNotSure)),
                for (final p in first.procedures)
                  DropdownMenuItem<String?>(value: p.procedure.id, child: Text(p.procedure.name)),
              ],
              onChanged: (v) => setState(() => _procedureId = v),
            )
          else
            Text(l10n.quoteTreatmentNotSure, style: context.text.bodyMedium),
          SectionTitle(
            l10n.quickQuoteReports,
            subtitle: l10n.quickQuoteReportsHint,
            padding: const EdgeInsets.only(top: 16, bottom: 8),
          ),
          for (final d in allDocs)
            CheckboxListTile(
              key: ValueKey('quick-quote-doc-${d.id}'),
              value: _documentIds.contains(d.id),
              onChanged: (v) => setState(() => v == true ? _documentIds.add(d.id) : _documentIds.remove(d.id)),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              title: Text(d.fileName, maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text(d.kind.label),
            ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              key: const ValueKey('quick-quote-upload'),
              icon: _uploading
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.upload_file_rounded),
              label: Text(l10n.quickQuoteUpload),
              onPressed: _uploading ? null : _upload,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _notes,
            minLines: 3,
            maxLines: 6,
            maxLength: 2000,
            decoration: InputDecoration(
              labelText: l10n.quoteNotesLabel,
              hintText: l10n.quoteNotesHint,
              alignLabelWithHint: true,
            ),
          ),
          CheckboxListTile(
            key: const ValueKey('quick-quote-consent'),
            value: _consent,
            onChanged: (v) => setState(() => _consent = v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            title: Text(
              names.length <= 1
                  ? l10n.quoteConsent(names.isEmpty ? '' : names.first)
                  : l10n.quickQuoteConsentMany(names.join(', ')),
              style: context.text.bodySmall,
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(_error!, style: context.text.bodySmall?.copyWith(color: AppColors.danger)),
            ),
        ],
      ),
    );
  }
}

class _HospitalRow extends ConsumerWidget {
  const _HospitalRow({required this.hospitalId, this.onRemove});

  final String hospitalId;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final h = ref.watch(hospitalDetailProvider(hospitalId)).value;
    final l10n = context.l10n;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsetsDirectional.fromSTEB(14, 6, 4, 6),
      child: Row(
        children: [
          const Icon(Icons.local_hospital_outlined, color: AppColors.primary),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(h?.name ?? '…', style: context.text.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                if (h != null && h.location.isNotEmpty) Text(h.location, style: context.text.bodySmall),
                if (h?.nextAvailableAdmission != null || h?.nextAvailableConsultation != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: EarliestDates(
                      consultation: h!.nextAvailableConsultation,
                      admission: h.nextAvailableAdmission,
                    ),
                  ),
              ],
            ),
          ),
          if (onRemove != null)
            IconButton(
              tooltip: l10n.quickQuoteRemoveHospital(h?.name ?? ''),
              icon: const Icon(Icons.close_rounded),
              onPressed: onRemove,
            ),
        ],
      ),
    );
  }
}

/// Picks another hospital: those offering the procedure (earliest first), else a name search.
class _HospitalPicker extends ConsumerStatefulWidget {
  const _HospitalPicker({required this.exclude, this.procedureSlug});

  final String? procedureSlug;
  final Set<String> exclude;

  @override
  ConsumerState<_HospitalPicker> createState() => _HospitalPickerState();
}

class _HospitalPickerState extends ConsumerState<_HospitalPicker> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final slug = widget.procedureSlug;
    final AsyncValue<List<HospitalCard>> options = slug != null
        ? ref.watch(procedureEarliestProvider(slug)).whenData((e) => [for (final i in e.items) i.hospital])
        : ref.watch(_hospitalSearchProvider(_q)).whenData((p) => p.items);
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      builder: (context, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.quickQuoteAddHospital, style: context.text.titleLarge),
                if (slug == null) ...[
                  const SizedBox(height: 8),
                  TextField(
                    onChanged: (v) => setState(() => _q = v.trim()),
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.search_rounded),
                      hintText: l10n.quickQuoteSearchHospitals,
                      isDense: true,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Expanded(
            child: AsyncValueView<List<HospitalCard>>(
              value: options,
              compactError: true,
              data: (list) {
                final items = list.where((h) => !widget.exclude.contains(h.id)).toList();
                if (items.isEmpty) return Center(child: Text(l10n.quickQuoteNoMoreHospitals));
                return ListView.builder(
                  controller: controller,
                  itemCount: items.length,
                  itemBuilder: (context, i) {
                    final h = items[i];
                    return ListTile(
                      leading: const Icon(Icons.local_hospital_outlined),
                      title: Text(h.name),
                      subtitle: Text(
                        [
                          h.location,
                          if (h.nextAvailableAdmission != null)
                            l10n.earliestAdmission(EarliestDates.label(l10n, h.nextAvailableAdmission!)),
                        ].where((s) => s.isNotEmpty).join(' · '),
                      ),
                      onTap: () => Navigator.of(context).pop(h),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

final _hospitalSearchProvider = FutureProvider.autoDispose.family<Paged<HospitalCard>, String>(
  (ref, q) => ref.watch(catalogRepositoryProvider).hospitals(q: q.isEmpty ? null : q, sort: 'soonest', pageSize: 30),
);
