import 'package:flutter/material.dart';

import '../models/money.dart';
import '../utils/money.dart';

/// Renders integer minor units as formatted currency (`$12,500`). Optionally a range.
class MoneyText extends StatelessWidget {
  const MoneyText(
    this.minor,
    this.currency, {
    super.key,
    this.maxMinor,
    this.style,
    this.compact = false,
    this.showDecimals,
    this.strikethrough = false,
    this.prefix,
    this.textAlign,
  });

  /// From a [Money] value.
  MoneyText.money(
    Money money, {
    Key? key,
    TextStyle? style,
    bool compact = false,
    bool? showDecimals,
    bool strikethrough = false,
    String? prefix,
    TextAlign? textAlign,
  }) : this(
         money.minor,
         money.currency,
         key: key,
         style: style,
         compact: compact,
         showDecimals: showDecimals,
         strikethrough: strikethrough,
         prefix: prefix,
         textAlign: textAlign,
       );

  final int minor;
  final String currency;

  /// When set, renders `min - max`.
  final int? maxMinor;
  final TextStyle? style;
  final bool compact;
  final bool? showDecimals;
  final bool strikethrough;

  /// Text before the amount, e.g. `Save `.
  final String? prefix;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final amount = maxMinor == null
        ? formatMoney(minor, currency, compact: compact, showDecimals: showDecimals)
        : formatMoneyRange(minor, maxMinor!, currency, compact: compact);
    final s = (style ?? DefaultTextStyle.of(context).style).copyWith(
      decoration: strikethrough ? TextDecoration.lineThrough : null,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Text('${prefix ?? ''}$amount', style: s, textAlign: textAlign, maxLines: 1, overflow: TextOverflow.ellipsis);
  }
}
