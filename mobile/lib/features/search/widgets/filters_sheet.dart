import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../providers/search_providers.dart';

/// Shows the filter sheet and returns the new filters (null when dismissed).
Future<SearchFilters?> showSearchFilters(BuildContext context, SearchFilters current) =>
    showModalBottomSheet<SearchFilters>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => SearchFiltersSheet(initial: current),
    );

/// Specialty, city, accreditation, language, doctor gender and sort filters.
class SearchFiltersSheet extends ConsumerStatefulWidget {
  const SearchFiltersSheet({super.key, required this.initial});

  final SearchFilters initial;

  @override
  ConsumerState<SearchFiltersSheet> createState() => _SearchFiltersSheetState();
}

class _SearchFiltersSheetState extends ConsumerState<SearchFiltersSheet> {
  late SearchFilters _f = widget.initial;
  late final _city = TextEditingController(text: widget.initial.city ?? '');

  @override
  void dispose() {
    _city.dispose();
    super.dispose();
  }

  void _apply() {
    final city = _city.text.trim();
    Navigator.of(context).pop(_f.copyWith(city: () => city.isEmpty ? null : city));
  }

  @override
  Widget build(BuildContext context) {
    final specialties = ref.watch(specialtiesProvider).value ?? const <Specialty>[];
    final bottom = MediaQuery.viewInsetsOf(context).bottom;
    final l10n = context.l10n;
    return Padding(
      padding: EdgeInsets.only(bottom: bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 8, 8),
            child: Row(
              children: [
                Expanded(child: Text(l10n.filtersTitle, style: context.text.titleLarge)),
                TextButton(
                  onPressed: () => setState(() {
                    _f = const SearchFilters();
                    _city.clear();
                  }),
                  child: Text(l10n.commonReset),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  DropdownButtonFormField<String?>(
                    initialValue: specialties.any((s) => s.slug == _f.specialty) ? _f.specialty : null,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: l10n.filtersSpecialtyLabel),
                    items: [
                      DropdownMenuItem<String?>(value: null, child: Text(l10n.filtersAnySpecialty)),
                      for (final s in specialties) DropdownMenuItem<String?>(value: s.slug, child: Text(s.name)),
                    ],
                    onChanged: (v) => setState(() => _f = _f.copyWith(specialty: () => v)),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _city,
                    textCapitalization: TextCapitalization.words,
                    decoration: InputDecoration(
                      labelText: l10n.filtersCityLabel,
                      hintText: l10n.filtersCityHint,
                      prefixIcon: const Icon(Icons.place_outlined),
                    ),
                  ),
                  _Label(l10n.filtersAccreditationLabel),
                  ChipToggleGroup<String>(
                    options: kAccreditations.keys.toList(),
                    selected: {?_f.accreditation},
                    labelOf: (k) => kAccreditations[k]!,
                    onChanged: (s) => setState(
                      () => _f = _f.copyWith(
                        accreditation: () => s.isEmpty || s.first == _f.accreditation ? null : s.first,
                      ),
                    ),
                  ),
                  _Label(l10n.filtersLanguageLabel),
                  ChipToggleGroup<String>(
                    options: kFilterLanguages,
                    selected: {?_f.language},
                    labelOf: (l) => filterLanguageLabel(l, l10n),
                    onChanged: (s) => setState(
                      () => _f = _f.copyWith(language: () => s.isEmpty || s.first == _f.language ? null : s.first),
                    ),
                  ),
                  _Label(l10n.filtersDoctorGenderLabel),
                  ChipToggleGroup<Gender>(
                    options: const [Gender.female, Gender.male],
                    selected: {?_f.doctorGender},
                    labelOf: (g) => g.label,
                    onChanged: (s) => setState(
                      () => _f = _f.copyWith(
                        doctorGender: () => s.isEmpty || s.first == _f.doctorGender ? null : s.first,
                      ),
                    ),
                  ),
                  _Label(l10n.filtersSortLabel),
                  ChipToggleGroup<HospitalSort>(
                    options: HospitalSort.values,
                    selected: {?_f.sort},
                    labelOf: (s) => s.localizedLabel(l10n),
                    onChanged: (s) =>
                        setState(() => _f = _f.copyWith(sort: () => s.isEmpty || s.first == _f.sort ? null : s.first)),
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: PrimaryButton(label: l10n.filtersShowResults, onPressed: _apply),
          ),
        ],
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 18, bottom: 8),
    child: Text(text, style: context.text.titleSmall),
  );
}
