import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../search/providers/search_providers.dart' show filterLanguageLabel;
import '../providers/match_view.dart';

/// Result of [showMatchSortFilterSheet].
typedef MatchViewChoice = ({MatchSort sort, MatchFilters filters});

/// Sort + filter bottom sheet. Language / city options are derived from [matches].
Future<MatchViewChoice?> showMatchSortFilterSheet(
  BuildContext context, {
  required List<ScreeningMatch> matches,
  required MatchSort sort,
  required MatchFilters filters,
}) => showModalBottomSheet<MatchViewChoice>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => _SortFilterSheet(matches: matches, sort: sort, filters: filters),
);

class _SortFilterSheet extends StatefulWidget {
  const _SortFilterSheet({required this.matches, required this.sort, required this.filters});

  final List<ScreeningMatch> matches;
  final MatchSort sort;
  final MatchFilters filters;

  @override
  State<_SortFilterSheet> createState() => _SortFilterSheetState();
}

class _SortFilterSheetState extends State<_SortFilterSheet> {
  late MatchSort _sort = widget.sort;
  late MatchFilters _filters = widget.filters;

  List<String> get _languages {
    final set = <String>{};
    for (final m in widget.matches) {
      set
        ..addAll(m.doctor?.languages ?? const [])
        ..addAll(m.hospital.languages);
    }
    final list = set.map((l) => l.trim()).where((l) => l.isNotEmpty).toSet().toList()..sort();
    return list;
  }

  List<String> get _cities {
    final list = widget.matches.map((m) => m.hospital.city).whereType<String>().toSet().toList()..sort();
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final languages = _languages;
    final cities = _cities;
    final l10n = context.l10n;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          children: [
            Text(l10n.matchSortBy, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            RadioGroup<MatchSort>(
              groupValue: _sort,
              onChanged: (v) => setState(() => _sort = v ?? _sort),
              child: Column(
                children: [
                  for (final s in MatchSort.values)
                    RadioListTile<MatchSort>(
                      value: s,
                      contentPadding: EdgeInsets.zero,
                      title: Text(s.localizedLabel(l10n)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(l10n.matchFilterTitle, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800)),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.matchFilterJciOnly),
              value: _filters.jciOnly,
              onChanged: (v) => setState(() => _filters = _filters.copyWith(jciOnly: v)),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: Text(l10n.matchFilterVideoConsult),
              value: _filters.teleconsultOnly,
              onChanged: (v) => setState(() => _filters = _filters.copyWith(teleconsultOnly: v)),
            ),
            if (languages.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(l10n.matchFilterSpeaks, style: context.text.labelLarge),
              const SizedBox(height: 8),
              ChipToggleGroup<String>(
                options: languages,
                multiSelect: true,
                selected: {
                  for (final l in languages)
                    if (_filters.languages.contains(l.toLowerCase())) l,
                },
                labelOf: (l) => filterLanguageLabel(l, l10n),
                onChanged: (s) =>
                    setState(() => _filters = _filters.copyWith(languages: {for (final l in s) l.toLowerCase()})),
              ),
            ],
            if (cities.length > 1) ...[
              const SizedBox(height: 16),
              Text(l10n.filtersCityLabel, style: context.text.labelLarge),
              const SizedBox(height: 8),
              ChipToggleGroup<String>(
                options: cities,
                multiSelect: true,
                selected: {
                  for (final c in cities)
                    if (_filters.cities.contains(c.toLowerCase())) c,
                },
                labelOf: (c) => c,
                onChanged: (s) =>
                    setState(() => _filters = _filters.copyWith(cities: {for (final c in s) c.toLowerCase()})),
              ),
            ],
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: SecondaryButton(
                    label: l10n.commonReset,
                    onPressed: () =>
                        Navigator.of(context).pop((sort: MatchSort.bestMatch, filters: const MatchFilters())),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: PrimaryButton(
                    label: l10n.commonApply,
                    onPressed: () => Navigator.of(context).pop((sort: _sort, filters: _filters)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
