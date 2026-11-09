import 'json.dart';

/// Paginated envelope `{"items": [...], "total", "page", "page_size", "pages"}` (PLAN §3).
///
/// Named `Paged` to avoid clashing with Flutter's `Page` class.
class Paged<T> {
  const Paged({
    required this.items,
    required this.total,
    required this.page,
    required this.pageSize,
    required this.pages,
  });

  /// Parses a page; also accepts a bare JSON list (treated as a single complete page).
  factory Paged.fromJson(Object? data, T Function(JsonMap) itemFromJson) {
    if (data is List) {
      final items = parseList(data, itemFromJson);
      return Paged(items: items, total: items.length, page: 1, pageSize: items.length, pages: 1);
    }
    final j = asJsonMap(data);
    final items = parseList(j['items'], itemFromJson);
    return Paged(
      items: items,
      total: jInt(j, 'total', items.length),
      page: jInt(j, 'page', 1),
      pageSize: jInt(j, 'page_size', 20),
      pages: jInt(j, 'pages', 1),
    );
  }

  factory Paged.empty() => Paged<T>(items: <T>[], total: 0, page: 1, pageSize: 20, pages: 0);

  final List<T> items;
  final int total;
  final int page;
  final int pageSize;
  final int pages;

  bool get hasMore => page < pages;
  bool get isEmpty => items.isEmpty;

  Map<String, dynamic> toJson(Map<String, dynamic> Function(T) itemToJson) => {
    'items': items.map(itemToJson).toList(),
    'total': total,
    'page': page,
    'page_size': pageSize,
    'pages': pages,
  };
}
