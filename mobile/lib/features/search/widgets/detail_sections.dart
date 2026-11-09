import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/models.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/widgets/widgets.dart';
import 'catalog_cards.dart';

/// Collapsible long text ("About").
class ExpandableText extends StatefulWidget {
  const ExpandableText(this.text, {super.key, this.maxLines = 4});

  final String text;
  final int maxLines;

  @override
  State<ExpandableText> createState() => _ExpandableTextState();
}

class _ExpandableTextState extends State<ExpandableText> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final style = context.text.bodyMedium?.copyWith(color: context.palette.textSecondary);
    return LayoutBuilder(
      builder: (context, c) {
        final painter = TextPainter(
          text: TextSpan(text: widget.text, style: style),
          maxLines: widget.maxLines,
          textDirection: Directionality.of(context),
        )..layout(maxWidth: c.maxWidth);
        final overflows = painter.didExceedMaxLines;
        painter.dispose();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.text,
              style: style,
              maxLines: _expanded ? null : widget.maxLines,
              overflow: _expanded ? TextOverflow.visible : TextOverflow.ellipsis,
            ),
            if (overflows)
              TextButton(
                style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 36)),
                onPressed: () => setState(() => _expanded = !_expanded),
                child: Text(_expanded ? 'Show less' : 'Read more'),
              ),
          ],
        );
      },
    );
  }
}

/// Treatment + price card for a `HospitalProcedureOut`, with its packages.
class HospitalProcedureCard extends StatelessWidget {
  const HospitalProcedureCard({super.key, required this.item, this.onTap});

  final HospitalProcedure item;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final p = item;
    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: Text(p.procedure.name, style: context.text.titleSmall)),
              if (p.successRatePct != null)
                StatusBadge(label: '${p.successRatePct!.round()}% Success', color: AppColors.primary, dense: true),
            ],
          ),
          const SizedBox(height: 4),
          ApproxPrice(
            p.priceMinMinor,
            p.currency,
            maxMinor: p.priceMaxMinor,
            style: context.text.titleMedium?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w800),
          ),
          if (p.hospitalStayDays != null)
            Text('${p.hospitalStayDays} days in hospital', style: context.text.bodySmall),
          if (p.inclusions.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                for (final i in p.inclusions.take(6))
                  StatusBadge(label: i, color: context.palette.textSecondary, icon: Icons.check_rounded, dense: true),
              ],
            ),
          ],
          if (p.packages.isNotEmpty) ...[
            const SizedBox(height: 10),
            for (final pkg in p.packages)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Row(
                  children: [
                    Icon(Icons.inventory_2_outlined, size: 16, color: context.palette.textSecondary),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        '${pkg.tier.label} · ${pkg.name}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: context.text.bodySmall,
                      ),
                    ),
                    ApproxPrice(pkg.priceMinor, pkg.currency, style: context.text.labelMedium),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// Published review.
class ReviewTile extends StatelessWidget {
  const ReviewTile({super.key, required this.review});

  final Review review;

  @override
  Widget build(BuildContext context) {
    final r = review;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              RatingStars(rating: r.rating.toDouble(), showValue: false, size: 14),
              const Spacer(),
              if (r.createdAt != null) Text(Dates.relative(r.createdAt), style: context.text.labelSmall),
            ],
          ),
          if ((r.title ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(r.title!, style: context.text.titleSmall),
          ],
          if ((r.body ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(r.body!, style: context.text.bodySmall),
          ],
          if ((r.patientName ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text('- ${r.patientName}', style: context.text.labelSmall),
          ],
        ],
      ),
    );
  }
}

/// Tappable contact row (phone / email / website / map).
class ContactRow extends StatelessWidget {
  const ContactRow({super.key, required this.icon, required this.label, required this.uri});

  final IconData icon;
  final String label;
  final Uri uri;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: AppColors.primary),
      title: Text(label, style: context.text.bodyMedium),
      trailing: const Icon(Icons.open_in_new_rounded, size: 18),
      onTap: () async {
        final ok = await launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
        if (!ok && context.mounted) showInfoSnack(context, 'Could not open $label');
      },
    );
  }
}

/// Section heading with consistent spacing for detail pages.
class DetailSection extends StatelessWidget {
  const DetailSection({super.key, required this.title, required this.child, this.actionLabel, this.onAction});

  final String title;
  final Widget child;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionTitle(title, actionLabel: actionLabel, onAction: onAction),
        child,
      ],
    );
  }
}

/// Wrap of neutral pills (specialties, languages, qualifications).
class PillWrap extends StatelessWidget {
  const PillWrap(this.items, {super.key, this.icon});

  final List<String> items;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final i in items)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: context.palette.surfaceAlt,
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[Icon(icon, size: 14, color: AppColors.primary), const SizedBox(width: 6)],
                Text(i, style: context.text.labelMedium?.copyWith(color: context.colors.onSurface)),
              ],
            ),
          ),
      ],
    );
  }
}

/// Sticky bottom bar with "Get matched" and "Request quote".
class DetailActionsBar extends StatelessWidget {
  const DetailActionsBar({super.key, required this.onGetMatched, required this.onRequestQuote});

  final VoidCallback onGetMatched;
  final VoidCallback onRequestQuote;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        decoration: BoxDecoration(
          color: context.colors.surfaceContainer,
          border: Border(top: BorderSide(color: context.palette.border)),
        ),
        child: Row(
          children: [
            Expanded(
              child: SecondaryButton(label: 'Get matched', icon: Icons.auto_awesome_outlined, onPressed: onGetMatched),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: PrimaryButton(label: 'Request quote', icon: Icons.request_quote_outlined, onPressed: onRequestQuote),
            ),
          ],
        ),
      ),
    );
  }
}
