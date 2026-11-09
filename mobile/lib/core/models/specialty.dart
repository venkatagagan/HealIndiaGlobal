import 'json.dart';

/// `SpecialtyOut` (PLAN §8.4).
class Specialty {
  const Specialty({
    required this.id,
    required this.slug,
    required this.name,
    this.description,
    this.icon,
    this.savingsMinPct,
    this.savingsMaxPct,
    this.proceduresCount = 0,
  });

  factory Specialty.fromJson(JsonMap j) => Specialty(
    id: jStr(j, 'id'),
    slug: jStr(j, 'slug'),
    name: jStr(j, 'name'),
    description: jStrOrNull(j, 'description'),
    icon: jStrOrNull(j, 'icon'),
    savingsMinPct: jIntOrNull(j, 'savings_min_pct'),
    savingsMaxPct: jIntOrNull(j, 'savings_max_pct'),
    proceduresCount: jInt(j, 'procedures_count'),
  );

  final String id;
  final String slug;
  final String name;
  final String? description;

  /// lucide / material icon name (see `specialtyIcon()` in core/widgets).
  final String? icon;
  final int? savingsMinPct;
  final int? savingsMaxPct;
  final int proceduresCount;

  /// `Save 60-80%` style label, or null when unknown.
  String? get savingsLabel {
    final lo = savingsMinPct;
    final hi = savingsMaxPct;
    if (lo == null && hi == null) return null;
    if (lo == null || hi == null || lo == hi) return 'Save ${lo ?? hi}%';
    return 'Save $lo-$hi%';
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'slug': slug,
    'name': name,
    'description': description,
    'icon': icon,
    'savings_min_pct': savingsMinPct,
    'savings_max_pct': savingsMaxPct,
    'procedures_count': proceduresCount,
  };
}
