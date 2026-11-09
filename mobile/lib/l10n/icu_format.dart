import 'package:intl/intl.dart';

/// Minimal ICU MessageFormat renderer for admin-edited strings (`/i18n/overrides`).
///
/// Supports the subset gen-l10n uses in our ARB files: `{name}` arguments, `{n, plural, =0{..} one{..}
/// other{..}}` (CLDR plural categories via [Intl.pluralLogic], `#` inside a plural case is the number) and
/// `{x, select, a{..} other{..}}`. Returns null when [message] is malformed or uses an unknown argument,
/// so the caller falls back to the shipped translation.
String? formatIcu(String message, Map<String, Object?> args, String locale) {
  try {
    final parser = _Parser(message);
    final nodes = parser.parseMessage(topLevel: true);
    final out = StringBuffer();
    _render(nodes, args, locale, out, null);
    return out.toString();
  } on FormatException {
    return null;
  }
}

/// Top-level argument names used by [message] (`{name}`, `{count, plural, ...}`), or null when malformed.
Set<String>? icuArgumentNames(String message) {
  try {
    final names = <String>{};
    void collect(List<_Node> nodes) {
      for (final n in nodes) {
        switch (n) {
          case _Arg(:final name):
            names.add(name);
          case _Choice(:final name, :final cases):
            names.add(name);
            cases.values.forEach(collect);
          case _Text() || _Hash():
            break;
        }
      }
    }

    collect(_Parser(message).parseMessage(topLevel: true));
    return names;
  } on FormatException {
    return null;
  }
}

sealed class _Node {
  const _Node();
}

class _Text extends _Node {
  const _Text(this.text);
  final String text;
}

class _Hash extends _Node {
  const _Hash();
}

class _Arg extends _Node {
  const _Arg(this.name);
  final String name;
}

class _Choice extends _Node {
  const _Choice(this.name, this.kind, this.cases);
  final String name;
  final String kind; // plural | select
  final Map<String, List<_Node>> cases;
}

class _Parser {
  _Parser(this.src);

  final String src;
  int pos = 0;

  bool get _done => pos >= src.length;

  List<_Node> parseMessage({required bool topLevel, bool inPlural = false}) {
    final nodes = <_Node>[];
    final text = StringBuffer();
    void flush() {
      if (text.isNotEmpty) {
        nodes.add(_Text(text.toString()));
        text.clear();
      }
    }

    while (!_done) {
      final c = src[pos];
      if (c == '{') {
        flush();
        nodes.add(_parseArgument());
      } else if (c == '}') {
        if (topLevel) throw const FormatException('unbalanced }');
        break;
      } else if (c == '#' && inPlural) {
        flush();
        nodes.add(const _Hash());
        pos++;
      } else {
        text.write(c);
        pos++;
      }
    }
    flush();
    return nodes;
  }

  void _skipSpaces() {
    while (!_done && src[pos].trim().isEmpty) {
      pos++;
    }
  }

  String _identifier() {
    _skipSpaces();
    final start = pos;
    while (!_done && RegExp(r'[A-Za-z0-9_]').hasMatch(src[pos])) {
      pos++;
    }
    if (start == pos) throw const FormatException('expected identifier');
    final id = src.substring(start, pos);
    _skipSpaces();
    return id;
  }

  _Node _parseArgument() {
    pos++; // {
    final name = _identifier();
    if (_done) throw const FormatException('unterminated argument');
    if (src[pos] == '}') {
      pos++;
      return _Arg(name);
    }
    if (src[pos] != ',') throw const FormatException('expected , or }');
    pos++;
    final kind = _identifier();
    if (kind != 'plural' && kind != 'select') throw FormatException('unsupported argument type $kind');
    if (_done || src[pos] != ',') throw const FormatException('expected ,');
    pos++;
    final cases = <String, List<_Node>>{};
    while (true) {
      _skipSpaces();
      if (_done) throw const FormatException('unterminated choice');
      if (src[pos] == '}') {
        pos++;
        break;
      }
      final start = pos;
      while (!_done && src[pos] != '{' && src[pos].trim().isNotEmpty) {
        pos++;
      }
      final selector = src.substring(start, pos);
      _skipSpaces();
      if (selector.isEmpty || _done || src[pos] != '{') throw const FormatException('expected case {');
      pos++;
      cases[selector] = parseMessage(topLevel: false, inPlural: kind == 'plural');
      if (_done || src[pos] != '}') throw const FormatException('unterminated case');
      pos++;
    }
    if (!cases.containsKey('other')) throw const FormatException('choice without other');
    return _Choice(name, kind, cases);
  }
}

void _render(List<_Node> nodes, Map<String, Object?> args, String locale, StringBuffer out, num? hash) {
  for (final n in nodes) {
    switch (n) {
      case _Text(:final text):
        out.write(text);
      case _Hash():
        out.write(hash ?? '#');
      case _Arg(:final name):
        if (!args.containsKey(name)) throw FormatException('unknown argument $name');
        out.write(args[name] ?? '');
      case _Choice(:final name, :final kind, :final cases):
        if (!args.containsKey(name)) throw FormatException('unknown argument $name');
        final value = args[name];
        if (kind == 'plural') {
          final count = value is num ? value : num.tryParse('$value') ?? 0;
          final exact = cases['=$count'] ?? (count == count.toInt() ? cases['=${count.toInt()}'] : null);
          final category = Intl.pluralLogic<String>(
            count,
            locale: locale,
            zero: 'zero',
            one: 'one',
            two: 'two',
            few: 'few',
            many: 'many',
            other: 'other',
          );
          _render(exact ?? cases[category] ?? cases['other']!, args, locale, out, count);
        } else {
          _render(cases['$value'] ?? cases['other']!, args, locale, out, hash);
        }
    }
  }
}
