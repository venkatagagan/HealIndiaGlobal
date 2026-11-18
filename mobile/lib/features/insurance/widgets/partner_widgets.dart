import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/models/models.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/dates.dart';
import '../../../core/utils/money.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../profile/data/countries.dart';

/// Opens a partner's website in the browser. Overridden in widget tests.
final partnerLinkLauncherProvider = Provider<Future<bool> Function(Uri)>(
  (ref) =>
      (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

/// Opens [url] (https only) with [partnerLinkLauncherProvider]; a snackbar when it cannot be opened.
Future<void> openPartnerLink(BuildContext context, WidgetRef ref, String? url) async {
  final uri = Uri.tryParse(url ?? '');
  var ok = false;
  if (uri != null && uri.scheme == 'https' && uri.host.isNotEmpty) {
    ok = await ref.read(partnerLinkLauncherProvider)(uri).catchError((_) => false);
  }
  if (!ok && context.mounted) showInfoSnack(context, context.l10n.insuranceCouldNotOpen);
}

/// Our own wording for the partner-request error codes; anything else keeps the server message.
String partnerErrorMessage(AppLocalizations l10n, Object error) {
  final api = ApiException.from(error);
  return switch (api.code) {
    'consent_required' => l10n.insuranceErrorConsentRequired,
    'partner_country_not_eligible' => l10n.insuranceErrorCountryNotEligible,
    'duplicate_request' => l10n.insuranceErrorDuplicate,
    'offering_not_found' => l10n.insuranceErrorNotFound,
    'lead_not_open' => l10n.insuranceErrorNotOpen,
    _ => api.message,
  };
}

String insuranceCategoryLabel(AppLocalizations l10n, String? category) => switch (category) {
  'medical_travel' => l10n.insuranceCategoryMedicalTravel,
  'complication' => l10n.insuranceCategoryComplication,
  'health' => l10n.insuranceCategoryHealth,
  _ => l10n.insuranceCategoryOther,
};

String partnerLeadStatusLabel(AppLocalizations l10n, PartnerLeadStatus s) => switch (s) {
  PartnerLeadStatus.newRequest => l10n.insuranceStatusNew,
  PartnerLeadStatus.inProgress => l10n.insuranceStatusInProgress,
  PartnerLeadStatus.sharedWithPartner => l10n.insuranceStatusShared,
  PartnerLeadStatus.closed => l10n.insuranceStatusClosed,
  PartnerLeadStatus.cancelled => l10n.insuranceStatusCancelled,
};

Color partnerLeadStatusColor(BuildContext context, PartnerLeadStatus s) => switch (s) {
  PartnerLeadStatus.newRequest => AppColors.info,
  PartnerLeadStatus.inProgress => AppColors.warning,
  PartnerLeadStatus.sharedWithPartner => AppColors.primary,
  PartnerLeadStatus.closed || PartnerLeadStatus.cancelled => context.palette.textSecondary,
};

/// The legal disclaimer shown on every insurance / pay-later surface (always visible).
class PartnerDisclaimer extends StatelessWidget {
  const PartnerDisclaimer({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      color: AppColors.info.withValues(alpha: 0.10),
      borderColor: AppColors.info.withValues(alpha: 0.35),
      padding: const EdgeInsetsDirectional.fromSTEB(12, 12, 12, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ExcludeSemantics(child: Icon(Icons.info_outline_rounded, size: 20, color: AppColors.info)),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: context.text.bodySmall)),
        ],
      ),
    );
  }
}

/// An insurance product or pay-later partner: provider, product, category, summary, countries,
/// indicative price, then "Request a quote" / "Check eligibility" and the partner's website.
class PartnerOfferingCard extends ConsumerWidget {
  const PartnerOfferingCard({super.key, required this.offering, required this.onRequest, this.country});

  final PartnerOffering offering;
  final VoidCallback onRequest;

  /// The country the list is shown for (to flag partners that do not serve it).
  final String? country;

  String? _price() {
    final ccy = offering.currency;
    if (ccy == null) return null;
    final lo = offering.priceMinMinor;
    final hi = offering.priceMaxMinor;
    if (lo != null && hi != null) return formatMoneyRange(lo, hi, ccy);
    if (lo != null) return formatMoney(lo, ccy);
    if (hi != null) return formatMoney(hi, ccy);
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final o = offering;
    final insurance = o.kind == PartnerKind.insurance;
    final price = _price();
    final countries = o.countries.isEmpty
        ? l10n.insuranceEligibleAll
        : l10n.insuranceEligibleCountries(o.countries.map((c) => countryName(c, l10n)).join(l10n.commonListSeparator));
    final muted = context.text.bodySmall?.copyWith(color: context.palette.textSecondary);
    return Padding(
      padding: const EdgeInsetsDirectional.only(bottom: 12),
      child: AppCard(
        key: ValueKey('offering-${o.id}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(o.providerName, style: context.text.labelLarge?.copyWith(color: context.palette.textSecondary)),
                  const SizedBox(height: 2),
                  Text(o.productName, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            if (insurance || (o.category ?? '').isNotEmpty) ...[
              const SizedBox(height: 8),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: StatusBadge(
                  label: insurance ? insuranceCategoryLabel(l10n, o.category) : o.category!,
                  color: AppColors.violetLight,
                  dense: true,
                ),
              ),
            ],
            if (o.summary.trim().isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(o.summary.trim(), style: context.text.bodyMedium),
            ],
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(child: Icon(Icons.public_rounded, size: 16, color: context.palette.textSecondary)),
                const SizedBox(width: 6),
                Expanded(child: Text(countries, style: muted)),
              ],
            ),
            if (!o.servesCountry(country))
              Padding(
                padding: const EdgeInsetsDirectional.only(top: 4),
                child: Text(
                  l10n.insuranceNotInYourCountry,
                  style: context.text.bodySmall?.copyWith(color: AppColors.warning),
                ),
              ),
            const SizedBox(height: 6),
            Text(
              price == null ? l10n.insurancePriceOnRequest : l10n.insurancePriceIndicative(price),
              style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
            if ((o.priceNote ?? '').trim().isNotEmpty) Text(o.priceNote!.trim(), style: muted),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                FilledButton.icon(
                  key: ValueKey('offering-request-${o.id}'),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                  onPressed: onRequest,
                  icon: Icon(insurance ? Icons.request_quote_outlined : Icons.fact_check_outlined, size: 18),
                  label: Text(insurance ? l10n.insuranceRequestQuote : l10n.financingCheckEligibility),
                ),
                if ((o.websiteUrl ?? '').isNotEmpty)
                  TextButton.icon(
                    key: ValueKey('offering-website-${o.id}'),
                    style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
                    onPressed: () => openPartnerLink(context, ref, o.websiteUrl),
                    icon: const Icon(Icons.open_in_new_rounded, size: 18),
                    label: Text(l10n.insuranceVisitWebsite),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// One of the patient's requests: kind, provider / product, status, date, hand-off link, withdraw.
class PartnerLeadTile extends ConsumerWidget {
  const PartnerLeadTile({super.key, required this.lead, required this.onWithdraw, this.busy = false});

  final PartnerLead lead;
  final VoidCallback onWithdraw;
  final bool busy;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final status = partnerLeadStatusLabel(l10n, lead.status);
    return Padding(
      padding: const EdgeInsetsDirectional.only(bottom: 12),
      child: AppCard(
        key: ValueKey('lead-${lead.id}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    lead.kind == PartnerKind.insurance ? l10n.insuranceKindQuote : l10n.financingKindEligibility,
                    style: context.text.labelLarge?.copyWith(color: context.palette.textSecondary),
                  ),
                ),
                const SizedBox(width: 8),
                Semantics(
                  label: l10n.insuranceStatusSemantics(status),
                  excludeSemantics: true,
                  child: StatusBadge(
                    key: ValueKey('lead-status-${lead.id}'),
                    label: status,
                    color: partnerLeadStatusColor(context, lead.status),
                    dense: true,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(lead.providerName, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            if (lead.productName.isNotEmpty) Text(lead.productName, style: context.text.bodyMedium),
            if (lead.createdAt != null) ...[
              const SizedBox(height: 4),
              Text(
                l10n.insuranceRequestSentOn(Dates.day(lead.createdAt)),
                style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
              ),
            ],
            if ((lead.partnerWebsiteUrl ?? '').isNotEmpty || lead.status.isOpen) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if ((lead.partnerWebsiteUrl ?? '').isNotEmpty && lead.status != PartnerLeadStatus.cancelled)
                    TextButton.icon(
                      key: ValueKey('lead-continue-${lead.id}'),
                      style: TextButton.styleFrom(minimumSize: const Size(0, 44)),
                      onPressed: () => openPartnerLink(context, ref, lead.partnerWebsiteUrl),
                      icon: const Icon(Icons.open_in_new_rounded, size: 18),
                      label: Text(l10n.insuranceContinueOnPartner),
                    ),
                  if (lead.status.isOpen)
                    TextButton.icon(
                      key: ValueKey('lead-withdraw-${lead.id}'),
                      style: TextButton.styleFrom(
                        foregroundColor: context.colors.error,
                        minimumSize: const Size(0, 44),
                      ),
                      onPressed: busy ? null : onWithdraw,
                      icon: const Icon(Icons.undo_rounded, size: 18),
                      label: Text(l10n.insuranceWithdraw),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
