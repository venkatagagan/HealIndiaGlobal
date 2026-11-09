import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../providers/search_providers.dart';
import '../widgets/catalog_cards.dart';
import '../widgets/filters_sheet.dart';
import '../widgets/paged_list.dart';
import '../widgets/procedure_sheet.dart';

/// Unified search over hospitals, doctors and procedures with filters.
///
/// Route: `/search?q=&specialty=` (tab) · Owner: fl-onboarding.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key, this.initialQuery, this.specialty});

  final String? initialQuery;

  /// Specialty slug pre-selected as a filter.
  final String? specialty;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);
  late final TextEditingController _input = TextEditingController(text: widget.initialQuery ?? '');
  late String _query = (widget.initialQuery ?? '').trim();
  late SearchFilters _filters = SearchFilters(specialty: _blankToNull(widget.specialty));
  Timer? _debounce;

  static String? _blankToNull(String? s) => s == null || s.trim().isEmpty ? null : s.trim();

  @override
  void didUpdateWidget(covariant SearchScreen old) {
    super.didUpdateWidget(old);
    // The tab is kept alive by the shell; new deep links (/search?q=...) update the state.
    if (old.initialQuery != widget.initialQuery && widget.initialQuery != null) {
      _input.text = widget.initialQuery!;
      _query = widget.initialQuery!.trim();
    }
    if (old.specialty != widget.specialty && widget.specialty != null) {
      _filters = _filters.copyWith(specialty: () => _blankToNull(widget.specialty));
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _tabs.dispose();
    _input.dispose();
    super.dispose();
  }

  void _onChanged(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (mounted && text.trim() != _query) setState(() => _query = text.trim());
    });
  }

  void _submit(String text) {
    _debounce?.cancel();
    setState(() => _query = text.trim());
  }

  void _clearQuery() {
    _debounce?.cancel();
    _input.clear();
    setState(() => _query = '');
  }

  Future<void> _openFilters() async {
    final next = await showSearchFilters(context, _filters);
    if (next != null && mounted) setState(() => _filters = next);
  }

  void _setFilters(SearchFilters f) => setState(() => _filters = f);

  @override
  Widget build(BuildContext context) {
    final specialties = ref.watch(specialtiesProvider).value ?? const <Specialty>[];
    String specialtyName(String slug) => specialties.where((s) => s.slug == slug).firstOrNull?.name ?? slug;
    final l10n = context.l10n;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 8, 8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      textInputAction: TextInputAction.search,
                      onChanged: _onChanged,
                      onSubmitted: _submit,
                      decoration: InputDecoration(
                        hintText: l10n.searchHint,
                        prefixIcon: const Icon(Icons.search_rounded),
                        isDense: true,
                        suffixIcon: ListenableBuilder(
                          listenable: _input,
                          builder: (context, _) => _input.text.isEmpty
                              ? const SizedBox.shrink()
                              : IconButton(
                                  tooltip: l10n.searchClearTooltip,
                                  icon: const Icon(Icons.close_rounded),
                                  onPressed: _clearQuery,
                                ),
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                          borderSide: BorderSide.none,
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                          borderSide: BorderSide.none,
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                          borderSide: const BorderSide(color: AppColors.primary),
                        ),
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: l10n.searchFiltersTooltip,
                    onPressed: _openFilters,
                    icon: Badge(
                      isLabelVisible: _filters.activeCount > 0,
                      label: Text('${_filters.activeCount}'),
                      child: const Icon(Icons.tune_rounded),
                    ),
                  ),
                ],
              ),
            ),
            if (_query.length >= 2) _SpecialtySuggestions(query: _query, filters: _filters, onSelect: _setFilters),
            if (_filters.activeCount > 0)
              _ActiveFilters(filters: _filters, onChanged: _setFilters, nameOf: specialtyName),
            TabBar(
              controller: _tabs,
              tabs: [
                Tab(text: l10n.searchTabHospitals),
                Tab(text: l10n.searchTabDoctors),
                Tab(text: l10n.searchTabProcedures),
              ],
            ),
            Expanded(
              child: TabBarView(controller: _tabs, children: [_hospitals(), _doctors(), _procedures()]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyResults(String title) => EmptyView(
    icon: Icons.search_off_rounded,
    title: title,
    message: _filters.activeCount > 0 || _query.isNotEmpty
        ? context.l10n.searchEmptyTryDifferent
        : context.l10n.searchEmptyCheckBack,
    actionLabel: _filters.activeCount > 0 ? context.l10n.searchClearFilters : null,
    onAction: _filters.activeCount > 0 ? () => _setFilters(const SearchFilters()) : null,
  );

  Widget _hospitals() {
    final repo = ref.read(catalogRepositoryProvider);
    final f = _filters;
    final q = _query;
    return PagedList<HospitalCard>(
      key: ValueKey('hospitals|$q|${f.cacheKey}'),
      fetch: (page) => repo.hospitals(
        q: q,
        city: f.city,
        specialty: f.specialty,
        accreditation: f.accreditation,
        language: f.language,
        sort: f.sort?.json,
        page: page,
      ),
      empty: _emptyResults(context.l10n.searchNoHospitalsFound),
      itemBuilder: (context, h) => HospitalListTile(hospital: h, onTap: () => context.push(Routes.hospital(h.id))),
    );
  }

  Widget _doctors() {
    final repo = ref.read(catalogRepositoryProvider);
    final f = _filters;
    final q = _query;
    return PagedList<DoctorCard>(
      key: ValueKey('doctors|$q|${f.cacheKey}'),
      fetch: (page) =>
          repo.doctors(q: q, specialty: f.specialty, language: f.language, gender: f.doctorGender, page: page),
      empty: _emptyResults(context.l10n.searchNoDoctorsFound),
      itemBuilder: (context, d) => DoctorListTile(doctor: d, onTap: () => context.push(Routes.doctor(d.id))),
    );
  }

  Widget _procedures() {
    final query = (q: _query, specialty: _filters.specialty);
    final value = ref.watch(searchProceduresProvider(query));
    return AsyncValueView<List<Procedure>>(
      value: value,
      onRetry: () => ref.invalidate(searchProceduresProvider(query)),
      data: (items) => items.isEmpty
          ? _emptyResults(context.l10n.searchNoProceduresFound)
          : RefreshIndicator(
              onRefresh: () => ref.refresh(searchProceduresProvider(query).future),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 10),
                itemBuilder: (context, i) =>
                    ProcedureListTile(procedure: items[i], onTap: () => showProcedureSheet(context, items[i])),
              ),
            ),
    );
  }
}

/// Specialties matching the query (from unified `/search`), tap to filter by one.
class _SpecialtySuggestions extends ConsumerWidget {
  const _SpecialtySuggestions({required this.query, required this.filters, required this.onSelect});

  final String query;
  final SearchFilters filters;
  final ValueChanged<SearchFilters> onSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(searchResultsProvider(query)).value?.specialties ?? const <Specialty>[];
    final options = matches.where((s) => s.slug != filters.specialty).toList();
    if (options.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        itemCount: options.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) => ChipToggle(
          label: options[i].name,
          selected: false,
          leading: Icon(specialtyIcon(options[i].icon ?? options[i].slug), size: 16, color: AppColors.primary),
          onChanged: (_) => onSelect(filters.copyWith(specialty: () => options[i].slug)),
        ),
      ),
    );
  }
}

/// Removable chips for the active filters.
class _ActiveFilters extends StatelessWidget {
  const _ActiveFilters({required this.filters, required this.onChanged, required this.nameOf});

  final SearchFilters filters;
  final ValueChanged<SearchFilters> onChanged;
  final String Function(String slug) nameOf;

  @override
  Widget build(BuildContext context) {
    final f = filters;
    final l10n = context.l10n;
    final chips = <(String, SearchFilters)>[
      if (f.specialty != null) (nameOf(f.specialty!), f.copyWith(specialty: () => null)),
      if (f.city != null) (f.city!, f.copyWith(city: () => null)),
      if (f.accreditation != null)
        (kAccreditations[f.accreditation] ?? f.accreditation!.toUpperCase(), f.copyWith(accreditation: () => null)),
      if (f.language != null) (filterLanguageLabel(f.language!, l10n), f.copyWith(language: () => null)),
      if (f.doctorGender != null)
        (
          l10n.searchGenderDoctorsChip(f.doctorGender!.json, f.doctorGender!.label),
          f.copyWith(doctorGender: () => null),
        ),
      if (f.sort != null) (f.sort!.localizedLabel(l10n), f.copyWith(sort: () => null)),
    ];
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        itemCount: chips.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) => ChipToggle(
          label: chips[i].$1,
          selected: true,
          onChanged: (_) => onChanged(chips[i].$2),
          onDeleted: () => onChanged(chips[i].$2),
        ),
      ),
    );
  }
}
