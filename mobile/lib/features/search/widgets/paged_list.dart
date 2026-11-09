import 'package:flutter/material.dart';

import '../../../core/models/models.dart';
import '../../../core/widgets/widgets.dart';

/// Infinite-scrolling list over a paginated endpoint (`Page[...]`, PLAN §3).
///
/// Give it a [Key] that changes with the query/filters to restart from page 1.
class PagedList<T> extends StatefulWidget {
  const PagedList({
    super.key,
    required this.fetch,
    required this.itemBuilder,
    required this.empty,
    this.padding = const EdgeInsets.fromLTRB(16, 8, 16, 24),
    this.separator = 10,
  });

  final Future<Paged<T>> Function(int page) fetch;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final Widget empty;
  final EdgeInsetsGeometry padding;
  final double separator;

  @override
  State<PagedList<T>> createState() => _PagedListState<T>();
}

class _PagedListState<T> extends State<PagedList<T>> {
  final List<T> _items = [];
  int _page = 0;
  int _total = 0;
  bool _hasMore = true;
  bool _loading = false;
  Object? _error;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _loading = true;
    _run(page: 1, reset: true, generation: ++_generation);
  }

  Future<void> _load({bool reset = false}) async {
    if (_loading && !reset) return;
    final generation = reset ? ++_generation : _generation;
    setState(() {
      _loading = true;
      _error = null;
    });
    await _run(page: reset ? 1 : _page + 1, reset: reset, generation: generation);
  }

  Future<void> _run({required int page, required bool reset, required int generation}) async {
    try {
      final result = await widget.fetch(page);
      if (!mounted || generation != _generation) return;
      setState(() {
        if (reset) _items.clear();
        _items.addAll(result.items);
        _page = result.page;
        _total = result.total;
        _hasMore = result.hasMore && result.items.isNotEmpty;
      });
    } on Object catch (e) {
      if (mounted && generation == _generation) setState(() => _error = e);
    } finally {
      if (mounted && generation == _generation) setState(() => _loading = false);
    }
  }

  bool _onScroll(ScrollNotification n) {
    if (n.metrics.pixels >= n.metrics.maxScrollExtent - 400 && _hasMore && !_loading && _error == null) {
      Future.microtask(() {
        if (mounted && !_loading) _load();
      });
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    if (_items.isEmpty) {
      if (_loading) return const LoadingView();
      if (_error != null) return ErrorView(error: _error, onRetry: () => _load(reset: true));
      return RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: LayoutBuilder(
          builder: (context, c) => SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            child: SizedBox(height: c.maxHeight, child: widget.empty),
          ),
        ),
      );
    }
    final footer = _error != null
        ? ErrorView(error: _error, compact: true, onRetry: _load)
        : (_hasMore
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2.4)),
                )
              : Padding(
                  padding: const EdgeInsets.all(16),
                  child: Center(
                    child: Text('$_total result${_total == 1 ? '' : 's'}', style: Theme.of(context).textTheme.bodySmall),
                  ),
                ));
    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: ListView.separated(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: widget.padding,
          itemCount: _items.length + 1,
          separatorBuilder: (_, _) => SizedBox(height: widget.separator),
          itemBuilder: (context, i) => i < _items.length ? widget.itemBuilder(context, _items[i]) : footer,
        ),
      ),
    );
  }
}
