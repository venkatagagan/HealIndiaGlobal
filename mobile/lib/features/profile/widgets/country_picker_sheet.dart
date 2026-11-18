import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../l10n/l10n.dart';
import '../data/countries.dart';

/// Result of [showCountryPicker]: a country code, or `auto` (let the app detect it).
typedef CountryChoice = ({String? code, bool auto});

/// Searchable country list in the app's language. With [allowAuto] the first row is "Detect automatically".
Future<CountryChoice?> showCountryPicker(
  BuildContext context, {
  String? selected,
  String? title,
  bool allowAuto = false,
}) => showModalBottomSheet<CountryChoice>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => _CountryPickerSheet(selected: selected, title: title, allowAuto: allowAuto),
);

class _CountryPickerSheet extends StatefulWidget {
  const _CountryPickerSheet({this.selected, this.title, this.allowAuto = false});

  final String? selected;
  final String? title;
  final bool allowAuto;

  @override
  State<_CountryPickerSheet> createState() => _CountryPickerSheetState();
}

class _CountryPickerSheetState extends State<_CountryPickerSheet> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final q = _query.trim().toLowerCase();
    final options = countryOptions(l10n)
        .where((e) => q.isEmpty || e.value.toLowerCase().contains(q) || e.key.toLowerCase() == q)
        .toList();
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, controller) => Column(
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 0, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.title ?? l10n.countryPickerTitle, style: context.text.titleLarge),
                const SizedBox(height: 8),
                TextField(
                  autofocus: false,
                  onChanged: (v) => setState(() => _query = v),
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search_rounded),
                    hintText: l10n.countryPickerSearch,
                    isDense: true,
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              controller: controller,
              itemCount: options.length + (widget.allowAuto ? 1 : 0),
              itemBuilder: (context, i) {
                if (widget.allowAuto && i == 0) {
                  return ListTile(
                    leading: const Icon(Icons.my_location_rounded),
                    title: Text(l10n.countryPickerAuto),
                    selected: widget.selected == null,
                    onTap: () => Navigator.of(context).pop((code: null, auto: true)),
                  );
                }
                final e = options[i - (widget.allowAuto ? 1 : 0)];
                return ListTile(
                  leading: Text(countryFlag(e.key), style: const TextStyle(fontSize: 22)),
                  title: Text(e.value),
                  selected: e.key == widget.selected?.toUpperCase(),
                  trailing: e.key == widget.selected?.toUpperCase() ? const Icon(Icons.check_rounded) : null,
                  onTap: () => Navigator.of(context).pop((code: e.key, auto: false)),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
