import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../data/hospital_models.dart';
import '../data/hospital_repository.dart';

/// Slot maintenance: consultation and admission capacity per day for one month, for a doctor
/// (`GET/PUT /hospital-portal/doctors/{id}/availability`) or the hospital as a whole
/// (`GET/PUT /hospital-portal/availability`). Mirrors the web portal's availability page: per-day fields,
/// "booked" counts, a quick fill for the month (optionally weekdays only) and one Save for all edits.
///
/// Routes: `/hospital/availability`, `/hospital/doctors/:id/availability?name=`.
class HospitalAvailabilityScreen extends ConsumerStatefulWidget {
  const HospitalAvailabilityScreen({super.key, this.doctorId, this.doctorName, this.initialMonth});

  /// Null: hospital-level slots.
  final String? doctorId;
  final String? doctorName;

  /// Month shown first (default: the current month).
  final DateTime? initialMonth;

  @override
  ConsumerState<HospitalAvailabilityScreen> createState() => _HospitalAvailabilityScreenState();
}

/// `yyyy-mm-dd|consultation`
String _key(DateTime day, SlotKind kind) => '${Dates.api(day)}|${kind.json}';

class _HospitalAvailabilityScreenState extends ConsumerState<HospitalAvailabilityScreen> {
  late DateTime _month = _firstOfMonth(widget.initialMonth ?? DateTime.now());

  /// Edited field text by [_key]; only keys the user touched.
  final Map<String, String> _edits = {};

  /// Bumped to rebuild the text fields from [_edits] / server values (quick fill, month change, save).
  int _version = 0;
  bool _saving = false;
  String? _error;

  final _bulkConsult = TextEditingController(text: '8');
  final _bulkAdmit = TextEditingController(text: '2');
  bool _weekdaysOnly = true;

  static DateTime _firstOfMonth(DateTime d) => DateTime(d.year, d.month);

  HospitalAvailabilityQuery get _query => (doctorId: widget.doctorId, month: _month);

  @override
  void dispose() {
    _bulkConsult.dispose();
    _bulkAdmit.dispose();
    super.dispose();
  }

  Map<String, AvailabilitySlot> _server(List<AvailabilitySlot> slots) => {
    for (final s in slots) _key(s.date, SlotKind.fromJson(s.slotKind)): s,
  };

  String _serverText(Map<String, AvailabilitySlot> server, String key) {
    final s = server[key];
    return s == null ? '' : '${s.capacity}';
  }

  String _valueOf(Map<String, AvailabilitySlot> server, String key) => _edits[key] ?? _serverText(server, key);

  /// Error text for a field, or null when valid.
  String? _invalid(AppLocalizations l10n, Map<String, AvailabilitySlot> server, String key) {
    final v = _valueOf(server, key).trim();
    if (v.isEmpty) {
      final booked = server[key]?.booked ?? 0;
      return booked > 0 ? l10n.hpAvailabilityBelowBooked(booked) : null;
    }
    final n = int.tryParse(v);
    if (n == null || n < 0 || n > 1000) return l10n.hpAvailabilityInvalidNumber;
    final booked = server[key]?.booked ?? 0;
    if (n < booked) return l10n.hpAvailabilityBelowBooked(booked);
    return null;
  }

  /// Keys whose text differs from the server value.
  List<String> _dirty(Map<String, AvailabilitySlot> server) => [
    for (final e in _edits.entries)
      if (e.value.trim() != _serverText(server, e.key)) e.key,
  ];

  bool get _hasEdits {
    final slots = ref.read(hospitalAvailabilityProvider(_query)).value;
    return slots != null && _dirty(_server(slots)).isNotEmpty;
  }

  List<DateTime> get _days {
    final last = DateTime(_month.year, _month.month + 1, 0).day;
    return [for (var d = 1; d <= last; d++) DateTime(_month.year, _month.month, d)];
  }

  bool _isPast(DateTime day) => day.isBefore(Dates.dateOnly(DateTime.now()));

  Future<bool> _confirmDiscard() async {
    if (!_hasEdits) return true;
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.hpAvailabilityDiscardTitle),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text(l10n.hpAvailabilityKeepEditing)),
          FilledButton(
            key: const ValueKey('availability-discard'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.hpAvailabilityDiscard),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  Future<void> _changeMonth(int delta) async {
    if (!await _confirmDiscard() || !mounted) return;
    setState(() {
      _month = DateTime(_month.year, _month.month + delta);
      _edits.clear();
      _error = null;
      _version++;
    });
  }

  void _quickFill() {
    final c = _bulkConsult.text.trim();
    final a = _bulkAdmit.text.trim();
    setState(() {
      for (final day in _days) {
        if (_isPast(day)) continue;
        if (_weekdaysOnly && (day.weekday == DateTime.saturday || day.weekday == DateTime.sunday)) continue;
        if (RegExp(r'^\d{1,4}$').hasMatch(c)) _edits[_key(day, SlotKind.consultation)] = c;
        if (RegExp(r'^\d{1,4}$').hasMatch(a)) _edits[_key(day, SlotKind.admission)] = a;
      }
      _version++;
    });
  }

  Future<void> _save(Map<String, AvailabilitySlot> server) async {
    final l10n = context.l10n;
    final dirty = _dirty(server);
    if (dirty.isEmpty || _saving) return;
    if (dirty.any((k) => _invalid(l10n, server, k) != null)) {
      setState(() => _error = l10n.hpAvailabilityFixErrors);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final slots = [
        for (final k in dirty)
          SlotCapacity(
            date: DateTime.parse(k.split('|').first),
            kind: SlotKind.fromJson(k.split('|').last),
            capacity: int.tryParse(_edits[k]!.trim()) ?? 0,
          ),
      ];
      await ref.read(hospitalRepositoryProvider).setAvailability(doctorId: widget.doctorId, slots: slots);
      ref.invalidate(hospitalAvailabilityProvider(_query));
      ref.invalidate(hospitalDoctorsProvider);
      if (!mounted) return;
      setState(() {
        _edits.clear();
        _error = null;
        _version++;
      });
      showInfoSnack(context, l10n.hpAvailabilitySaved);
    } on Object catch (e) {
      if (!mounted) return;
      setState(
        () => _error = e is ApiException && e.code == 'capacity_below_booked'
            ? l10n.hpAvailabilityBelowBookedError
            : errorMessage(e),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final async = ref.watch(hospitalAvailabilityProvider(_query));
    final server = _server(async.value ?? const []);
    final dirty = async.hasValue && _dirty(server).isNotEmpty;
    final title = widget.doctorId == null
        ? l10n.hpAvailabilityTitle
        : ((widget.doctorName ?? '').isEmpty
              ? l10n.hpAvailabilityEditButton
              : l10n.hpAvailabilityDoctorTitle(widget.doctorName!));
    return PopScope(
      canPop: !dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final navigator = Navigator.of(context);
        if (await _confirmDiscard()) {
          _edits.clear();
          navigator.pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(title),
          actions: [
            TextButton(
              key: const ValueKey('availability-save'),
              onPressed: dirty && !_saving ? () => _save(server) : null,
              child: _saving
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(l10n.commonSave),
            ),
          ],
        ),
        bottomNavigationBar: _error == null
            ? null
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(16, 8, 16, 12),
                  child: Text(
                    _error!,
                    key: const ValueKey('availability-error'),
                    style: context.text.bodyMedium?.copyWith(color: AppColors.danger),
                  ),
                ),
              ),
        body: AsyncValueView<List<AvailabilitySlot>>(
          value: async,
          onRetry: () => ref.invalidate(hospitalAvailabilityProvider(_query)),
          data: (_) => ListView(
            padding: AppSpacing.pageAll,
            children: [
              Text(
                widget.doctorId == null ? l10n.hpAvailabilityIntroHospital : l10n.hpAvailabilityIntroDoctor,
                style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
              ),
              const SizedBox(height: 12),
              _monthHeader(context),
              const SizedBox(height: 8),
              for (final day in _days) _dayRow(context, server, day),
              const SizedBox(height: 16),
              _quickFillCard(context),
            ],
          ),
        ),
      ),
    );
  }

  Widget _monthHeader(BuildContext context) {
    final l10n = context.l10n;
    final current = _firstOfMonth(DateTime.now());
    return Row(
      children: [
        IconButton(
          key: const ValueKey('availability-prev-month'),
          tooltip: l10n.bookCalendarPreviousMonth,
          onPressed: _month.isAfter(current) ? () => _changeMonth(-1) : null,
          icon: const Icon(Icons.chevron_left_rounded),
        ),
        Expanded(
          child: Text(
            Dates.monthYear(_month),
            textAlign: TextAlign.center,
            style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
        ),
        IconButton(
          key: const ValueKey('availability-next-month'),
          tooltip: l10n.bookCalendarNextMonth,
          onPressed: () => _changeMonth(1),
          icon: const Icon(Icons.chevron_right_rounded),
        ),
      ],
    );
  }

  Widget _dayRow(BuildContext context, Map<String, AvailabilitySlot> server, DateTime day) {
    final l10n = context.l10n;
    final past = _isPast(day);
    final weekend = day.weekday == DateTime.saturday || day.weekday == DateTime.sunday;
    Widget field(SlotKind kind) {
      final key = _key(day, kind);
      final slot = server[key];
      final label = kind == SlotKind.consultation ? l10n.hpAvailabilityConsultShort : l10n.hpAvailabilityAdmitShort;
      if (past) {
        return Text(
          '$label: ${slot?.capacity ?? '-'}',
          style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
        );
      }
      return _CapacityField(
        key: ValueKey('cap-$key-$_version'),
        fieldKey: ValueKey('cap-$key'),
        initial: _valueOf(server, key),
        label: label,
        helper: (slot?.booked ?? 0) > 0 ? l10n.hpAvailabilityBooked(slot!.booked) : null,
        error: _edits.containsKey(key) ? _invalid(l10n, server, key) : null,
        onChanged: (v) => setState(() => _edits[key] = v),
      );
    }

    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsetsDirectional.fromSTEB(12, 10, 12, 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Padding(
              padding: const EdgeInsetsDirectional.only(top: 12),
              child: Text(
                Dates.weekday(day),
                style: context.text.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: past ? context.palette.textMuted : (weekend ? context.palette.textSecondary : null),
                ),
              ),
            ),
          ),
          if (past)
            Expanded(
              child: Padding(
                padding: const EdgeInsetsDirectional.only(top: 12),
                child: Wrap(
                  spacing: 12,
                  children: [
                    Text(
                      l10n.hpAvailabilityPastDay,
                      style: context.text.bodySmall?.copyWith(color: context.palette.textMuted),
                    ),
                    field(SlotKind.consultation),
                    field(SlotKind.admission),
                  ],
                ),
              ),
            )
          else ...[
            Expanded(child: field(SlotKind.consultation)),
            const SizedBox(width: 10),
            Expanded(child: field(SlotKind.admission)),
          ],
        ],
      ),
    );
  }

  Widget _quickFillCard(BuildContext context) {
    final l10n = context.l10n;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(l10n.hpAvailabilityQuickFill, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text(
            l10n.hpAvailabilityQuickFillHint(Dates.monthYear(_month)),
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const ValueKey('bulk-consultation'),
                  controller: _bulkConsult,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
                  decoration: InputDecoration(labelText: l10n.hpAvailabilityConsultShort, isDense: true),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: TextField(
                  key: const ValueKey('bulk-admission'),
                  controller: _bulkAdmit,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
                  decoration: InputDecoration(labelText: l10n.hpAvailabilityAdmitShort, isDense: true),
                ),
              ),
            ],
          ),
          SwitchListTile(
            key: const ValueKey('bulk-weekdays-only'),
            contentPadding: EdgeInsets.zero,
            value: _weekdaysOnly,
            onChanged: (v) => setState(() => _weekdaysOnly = v),
            title: Text(l10n.hpAvailabilityWeekdaysOnly, style: context.text.bodyMedium),
          ),
          SecondaryButton(
            key: const ValueKey('bulk-apply'),
            label: l10n.hpAvailabilityApply,
            icon: Icons.auto_fix_high_rounded,
            onPressed: _quickFill,
          ),
        ],
      ),
    );
  }
}

/// A digits-only capacity field that owns its controller (rebuilt via its key when the parent resets).
class _CapacityField extends StatefulWidget {
  const _CapacityField({
    super.key,
    required this.fieldKey,
    required this.initial,
    required this.label,
    required this.onChanged,
    this.helper,
    this.error,
  });

  final Key fieldKey;
  final String initial;
  final String label;
  final String? helper;
  final String? error;
  final ValueChanged<String> onChanged;

  @override
  State<_CapacityField> createState() => _CapacityFieldState();
}

class _CapacityFieldState extends State<_CapacityField> {
  late final TextEditingController _c = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
    key: widget.fieldKey,
    controller: _c,
    keyboardType: TextInputType.number,
    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(4)],
    onChanged: widget.onChanged,
    decoration: InputDecoration(
      labelText: widget.label,
      helperText: widget.helper,
      errorText: widget.error,
      isDense: true,
    ),
  );
}
