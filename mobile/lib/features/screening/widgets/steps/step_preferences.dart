import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';

import '../../../../core/config/app_preferences.dart';
import '../../../../core/models/models.dart';
import '../../../../core/network/api_exception.dart';
import '../../../../core/repositories/catalog_repository.dart';
import '../../../../core/repositories/patient_repository.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../core/utils/dates.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../../l10n/l10n.dart';
import '../../providers/screening_draft.dart';
import '../ai_consent_sheet.dart';
import '../screening_step_scaffold.dart';
import 'step_actions.dart';

/// Preferred-language options with flags. The English names are the wire values (sent as names; the
/// server normalizes them); [languageOptionLabel] gives the display name.
const List<(String, String)> kLanguageOptions = [
  ('Hindi', '🇮🇳'),
  ('English', '🇬🇧'),
  ('Arabic', '🇸🇦'),
  ('Spanish', '🇪🇸'),
  ('French', '🇫🇷'),
  ('Russian', '🇷🇺'),
];

/// Display name of a [kLanguageOptions] wire value in the language of [l] (unknown values as-is).
String languageOptionLabel(String name, AppLocalizations l) => switch (name) {
  'Hindi' => l.screeningLangHindi,
  'English' => l.screeningLangEnglish,
  'Arabic' => l.screeningLangArabic,
  'Spanish' => l.screeningLangSpanish,
  'French' => l.screeningLangFrench,
  'Russian' => l.screeningLangRussian,
  _ => name,
};

/// Budget slider bounds in USD (converted to the patient's currency for display and storage).
const int kBudgetMinUsd = 5000;
const int kBudgetMaxUsd = 50000;
const int kBudgetStepUsd = 1000;

/// Step 4 - "Personalize Your Matches" (optional): language, doctor gender, budget, travel window,
/// AI toggle -> "Find My Doctors" (PATCH + submit).
class PreferencesStep extends ScreeningStepView {
  const PreferencesStep({super.key, required super.screeningId});

  @override
  ConsumerState<PreferencesStep> createState() => _PreferencesStepState();
}

class _PreferencesStepState extends ConsumerState<PreferencesStep> with ScreeningStepActions {
  late DateTime _focusedDay = _initialFocus();

  @override
  int get step => 4;

  DateTime _initialFocus() {
    final start = draft?.preferences.travelWindowStart;
    final today = DateUtils.dateOnly(DateTime.now());
    return start != null && start.isAfter(today) ? start : today;
  }

  /// Patient currency: profile `preferred_currency`, else the locally stored preference.
  String _currency() {
    final String? fromProfile = ref.watch(patientProfileProvider).value?.preferredCurrency;
    final String local = ref.watch(preferredCurrencyProvider);
    return (fromProfile ?? local).toUpperCase();
  }

  void _setPrefs(ScreeningPreferences Function(ScreeningPreferences p) change) =>
      edit((d) => d.copyWith(preferences: change(d.preferences)));

  /// Rebuilds preferences (copyWith cannot clear nullable fields).
  static ScreeningPreferences _rebuild(
    ScreeningPreferences p, {
    bool clearBudget = false,
    bool clearWindow = false,
    int? budgetMin,
    int? budgetMax,
    String? budgetCurrency,
    DateTime? start,
    DateTime? end,
  }) => ScreeningPreferences(
    languages: p.languages,
    doctorGender: p.doctorGender,
    useAi: p.useAi,
    budgetMinMinor: clearBudget ? null : (budgetMin ?? p.budgetMinMinor),
    budgetMaxMinor: clearBudget ? null : (budgetMax ?? p.budgetMaxMinor),
    budgetCurrency: clearBudget ? null : (budgetCurrency ?? p.budgetCurrency),
    travelWindowStart: clearWindow ? null : (start ?? p.travelWindowStart),
    travelWindowEnd: clearWindow ? null : (end ?? p.travelWindowEnd),
  );

  Future<void> _find({bool useDefaults = false}) async {
    if (busy) return;
    var d = draft;
    if (d == null) return;
    if (useDefaults) {
      edit((x) => x.copyWith(preferences: ScreeningPreferences(useAi: x.preferences.useAi)));
      d = draft!;
    }
    final problem = d.validate(step, context.l10n);
    if (problem != null) {
      showInfoSnack(context, problem);
      return;
    }
    var consent = false;
    if (d.preferences.useAi) {
      final answer = await showAiConsentSheet(context);
      if (answer == null || !mounted) return;
      if (answer) {
        consent = true;
      } else {
        _setPrefs((p) => p.copyWith(useAi: false));
      }
    }
    setState(() => busy = true);
    try {
      await draftController.save(step);
      await draftController.submit(consentAi: consent);
      if (!mounted) return;
      context.go(Routes.screeningProcessing(screeningId));
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'screening_incomplete') {
        showErrorSnack(context, e);
        context.go(Routes.screeningStep(screeningId, 1));
      } else {
        showErrorSnack(context, e);
      }
    } catch (e) {
      if (mounted) showErrorSnack(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(screeningDraftProvider(screeningId)).requireValue;
    final p = d.preferences;
    final ccy = _currency();
    final fx = ref.watch(fxRatesProvider).value ?? const <String, double>{};
    final budgetCcy = ccy == 'USD' || fx.containsKey(ccy) ? ccy : 'USD';
    int toMinor(double usd) => convertMinor(majorToMinor(usd, 'USD'), 'USD', budgetCcy, fx);
    double toUsd(int minor, String from) =>
        minorToMajor(convertMinor(minor, from, 'USD', fx), 'USD').clamp(kBudgetMinUsd, kBudgetMaxUsd).toDouble();
    final hasBudget = p.budgetMinMinor != null && p.budgetMaxMinor != null;
    final range = hasBudget
        ? RangeValues(
            toUsd(p.budgetMinMinor!, p.budgetCurrency ?? budgetCcy),
            toUsd(p.budgetMaxMinor!, p.budgetCurrency ?? budgetCcy),
          )
        : const RangeValues(kBudgetMinUsd + 0.0, kBudgetMaxUsd + 0.0);
    final l10n = context.l10n;

    return ScreeningStepScaffold(
      step: step,
      optional: true,
      title: l10n.screeningStep4Title,
      titleAlign: TextAlign.start,
      primaryLabel: l10n.screeningFindDoctors,
      busy: busy,
      onPrimary: _find,
      onBack: goPrevious,
      onSaveExit: saveAndExit,
      footer: Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: TextButton(
          onPressed: busy ? null : () => _find(useDefaults: true),
          style: TextButton.styleFrom(foregroundColor: context.palette.textSecondary),
          child: Text(l10n.screeningSkipDefaults, style: const TextStyle(decoration: TextDecoration.underline)),
        ),
      ),
      children: [
        _Label(l10n.languageSettingTitle),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final (name, flag) in kLanguageOptions)
              ChipToggle(
                label: languageOptionLabel(name, l10n),
                leading: Text(flag, style: const TextStyle(fontSize: 16)),
                selected: p.languages.any((l) => l.toLowerCase() == name.toLowerCase()),
                onChanged: (on) => _setPrefs(
                  (x) => x.copyWith(
                    languages: on
                        ? [...x.languages, name]
                        : [
                            for (final l in x.languages)
                              if (l.toLowerCase() != name.toLowerCase()) l,
                          ],
                  ),
                ),
              ),
          ],
        ),
        _Label(l10n.screeningPrefDoctorGender),
        _GenderSegments(
          value: p.doctorGender,
          onChanged: (g) => _setPrefs((x) => x.copyWith(doctorGender: g)),
        ),
        _Label(l10n.screeningPrefBudgetRange),
        RangeSlider(
          values: range,
          min: kBudgetMinUsd.toDouble(),
          max: kBudgetMaxUsd.toDouble(),
          divisions: (kBudgetMaxUsd - kBudgetMinUsd) ~/ kBudgetStepUsd,
          activeColor: AppColors.primary,
          labels: RangeLabels(
            formatMoney(toMinor(range.start), budgetCcy, compact: true),
            formatMoney(toMinor(range.end), budgetCcy, compact: true),
          ),
          semanticFormatterCallback: (v) => formatMoney(toMinor(v), budgetCcy, compact: true),
          onChanged: (r) => _setPrefs(
            (x) => _rebuild(x, budgetMin: toMinor(r.start), budgetMax: toMinor(r.end), budgetCurrency: budgetCcy),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              Text(formatMoney(toMinor(range.start), budgetCcy, compact: true), style: context.text.labelMedium),
              Expanded(
                child: Text(
                  hasBudget ? l10n.screeningPrefYourBudget : l10n.screeningPrefAnyBudget,
                  textAlign: TextAlign.center,
                  style: context.text.labelSmall?.copyWith(color: context.palette.textMuted),
                ),
              ),
              Text(formatMoney(toMinor(range.end), budgetCcy, compact: true), style: context.text.labelMedium),
            ],
          ),
        ),
        if (hasBudget)
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: TextButton(
              onPressed: () => _setPrefs((x) => _rebuild(x, clearBudget: true)),
              child: Text(l10n.screeningPrefClearBudget),
            ),
          ),
        _Label(l10n.screeningPrefTravelWindow),
        _TravelCalendar(
          focusedDay: _focusedDay,
          start: p.travelWindowStart,
          end: p.travelWindowEnd,
          onPageChanged: (f) => _focusedDay = f,
          onRangeSelected: (start, end, focused) {
            setState(() => _focusedDay = focused);
            _setPrefs(
              (x) => start == null
                  ? _rebuild(x, clearWindow: true)
                  : ScreeningPreferences(
                      languages: x.languages,
                      doctorGender: x.doctorGender,
                      useAi: x.useAi,
                      budgetMinMinor: x.budgetMinMinor,
                      budgetMaxMinor: x.budgetMaxMinor,
                      budgetCurrency: x.budgetCurrency,
                      travelWindowStart: start,
                      travelWindowEnd: end,
                    ),
            );
          },
        ),
        if (p.travelWindowStart != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              p.travelWindowEnd == null
                  ? l10n.screeningPrefTravelFrom(Dates.day(p.travelWindowStart))
                  : l10n.screeningPrefTravelRange(Dates.day(p.travelWindowStart), Dates.day(p.travelWindowEnd)),
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
          ),
        const SizedBox(height: 20),
        SwitchListTile.adaptive(
          contentPadding: EdgeInsets.zero,
          value: p.useAi,
          activeTrackColor: AppColors.primary,
          title: Text(l10n.screeningPrefUseAi, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
          subtitle: Text(
            p.useAi ? l10n.screeningPrefUseAiOn : l10n.screeningPrefUseAiOff,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
          onChanged: (v) => _setPrefs((x) => x.copyWith(useAi: v)),
        ),
      ],
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 18, bottom: 10),
    child: Text(text, style: context.text.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
  );
}

class _GenderSegments extends StatelessWidget {
  const _GenderSegments({required this.value, required this.onChanged});

  final DoctorGenderPref value;
  final ValueChanged<DoctorGenderPref> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: context.palette.surfaceAlt, borderRadius: BorderRadius.circular(AppRadius.pill)),
      child: Row(
        children: [
          for (final g in const [DoctorGenderPref.male, DoctorGenderPref.female, DoctorGenderPref.noPreference])
            Expanded(
              child: Semantics(
                button: true,
                selected: g == value,
                child: InkWell(
                  borderRadius: BorderRadius.circular(AppRadius.pill),
                  onTap: () => onChanged(g),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: g == value ? context.theme.scaffoldBackgroundColor : Colors.transparent,
                      borderRadius: BorderRadius.circular(AppRadius.pill),
                    ),
                    child: Text(
                      g.label,
                      style: context.text.labelMedium?.copyWith(
                        fontWeight: g == value ? FontWeight.w800 : FontWeight.w500,
                        color: g == value ? context.colors.onSurface : context.palette.textSecondary,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TravelCalendar extends StatelessWidget {
  const _TravelCalendar({
    required this.focusedDay,
    required this.start,
    required this.end,
    required this.onRangeSelected,
    required this.onPageChanged,
  });

  final DateTime focusedDay;
  final DateTime? start;
  final DateTime? end;
  final void Function(DateTime? start, DateTime? end, DateTime focused) onRangeSelected;
  final ValueChanged<DateTime> onPageChanged;

  @override
  Widget build(BuildContext context) {
    final today = DateUtils.dateOnly(DateTime.now());
    final last = DateTime(today.year + 2, today.month, today.day);
    final cell = BoxDecoration(color: context.palette.surfaceAlt, borderRadius: BorderRadius.circular(6));
    final picked = BoxDecoration(color: AppColors.primary, borderRadius: BorderRadius.circular(6));
    final text = context.text.bodySmall ?? const TextStyle();
    return AppCard(
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
      child: TableCalendar<void>(
        firstDay: today,
        lastDay: last,
        focusedDay: focusedDay.isBefore(today) ? today : (focusedDay.isAfter(last) ? last : focusedDay),
        rangeStartDay: start,
        rangeEndDay: end,
        rangeSelectionMode: RangeSelectionMode.toggledOn,
        availableCalendarFormats: const {CalendarFormat.month: 'Month'},
        startingDayOfWeek: StartingDayOfWeek.sunday,
        rowHeight: 42,
        onRangeSelected: onRangeSelected,
        onPageChanged: onPageChanged,
        headerStyle: HeaderStyle(
          titleCentered: true,
          formatButtonVisible: false,
          titleTextStyle: context.text.titleSmall!.copyWith(fontWeight: FontWeight.w700),
          leftChevronIcon: Icon(Icons.chevron_left_rounded, color: context.colors.onSurface),
          rightChevronIcon: Icon(Icons.chevron_right_rounded, color: context.colors.onSurface),
        ),
        daysOfWeekStyle: DaysOfWeekStyle(
          weekdayStyle: text.copyWith(color: context.palette.textSecondary),
          weekendStyle: text.copyWith(color: context.palette.textSecondary),
          dowTextFormatter: (d, locale) => DateFormat.EEEEE(locale?.toString()).format(d),
        ),
        calendarStyle: CalendarStyle(
          cellMargin: const EdgeInsets.all(3),
          outsideDaysVisible: false,
          defaultDecoration: cell,
          weekendDecoration: cell,
          disabledDecoration: BoxDecoration(borderRadius: BorderRadius.circular(6)),
          todayDecoration: cell.copyWith(border: Border.all(color: AppColors.primary)),
          rangeStartDecoration: picked,
          rangeEndDecoration: picked,
          withinRangeDecoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.25),
            borderRadius: BorderRadius.circular(6),
          ),
          rangeHighlightColor: Colors.transparent,
          defaultTextStyle: text,
          weekendTextStyle: text,
          todayTextStyle: text.copyWith(fontWeight: FontWeight.w700),
          disabledTextStyle: text.copyWith(color: context.palette.textMuted.withValues(alpha: 0.5)),
          withinRangeTextStyle: text.copyWith(fontWeight: FontWeight.w700),
          rangeStartTextStyle: text.copyWith(color: const Color(0xFF052E16), fontWeight: FontWeight.w800),
          rangeEndTextStyle: text.copyWith(color: const Color(0xFF052E16), fontWeight: FontWeight.w800),
        ),
      ),
    );
  }
}
