import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/partner_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../profile/data/countries.dart';
import '../../profile/widgets/country_picker_sheet.dart';
import '../widgets/partner_lead_sheet.dart';
import '../widgets/partner_widgets.dart';

/// Tabs of the insurance screen (`?tab=`).
enum InsuranceTab {
  insurance('insurance'),
  payLater('pay_later'),
  requests('requests');

  const InsuranceTab(this.query);

  final String query;

  static InsuranceTab fromQuery(String? v) => InsuranceTab.values.where((t) => t.query == v).firstOrNull ?? insurance;
}

/// Insurance and pay later (CG-18): partner insurance products (`GET /insurance/products`), pay-later
/// partners (`GET /financing/partners`), and the patient's requests to them with withdraw. The platform
/// lists partners for information only; the partner quotes, decides eligibility and provides any credit
/// on its own site. Guests may use it.
///
/// Route: `/insurance?tab=&case=&booking=` (from Profile and the booking flow).
class InsuranceScreen extends ConsumerStatefulWidget {
  const InsuranceScreen({super.key, this.initialTab = InsuranceTab.insurance, this.caseId, this.bookingId});

  final InsuranceTab initialTab;

  /// The case / booking a request is linked to when opened from the booking flow.
  final String? caseId;
  final String? bookingId;

  @override
  ConsumerState<InsuranceScreen> createState() => _InsuranceScreenState();
}

class _InsuranceScreenState extends ConsumerState<InsuranceScreen> {
  bool _countryChosen = false;
  String? _chosenCountry;
  final Set<String> _withdrawing = {};

  /// The country the lists are shown for (watched in build, read in callbacks).
  String? _countryIn({bool watch = true}) =>
      _countryChosen ? _chosenCountry : (watch ? ref.watch(partnerCountryProvider) : ref.read(partnerCountryProvider));

  Future<void> _pickCountry() async {
    final choice = await showCountryPicker(
      context,
      selected: _countryIn(watch: false),
      title: context.l10n.insuranceCountryPick,
    );
    if (choice?.code != null && mounted) {
      setState(() {
        _countryChosen = true;
        _chosenCountry = choice!.code!.toUpperCase();
      });
    }
  }

  Future<void> _request(PartnerOffering o) async {
    final lead = await showPartnerLeadSheet(
      context,
      offering: o,
      country: _countryIn(watch: false),
      caseId: widget.caseId,
      bookingId: widget.bookingId,
    );
    if (lead != null && mounted) ref.invalidate(myPartnerLeadsProvider);
  }

  Future<void> _withdraw(PartnerLead lead) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) {
        final l10n = context.l10n;
        return AlertDialog(
          title: Text(l10n.insuranceWithdrawTitle),
          content: Text(l10n.insuranceWithdrawBody(lead.providerName)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: Text(l10n.commonCancel)),
            TextButton(
              key: const ValueKey('lead-withdraw-confirm'),
              style: TextButton.styleFrom(foregroundColor: context.colors.error),
              onPressed: () => Navigator.pop(context, true),
              child: Text(l10n.insuranceWithdraw),
            ),
          ],
        );
      },
    );
    if (ok != true || !mounted) return;
    setState(() => _withdrawing.add(lead.id));
    try {
      await ref.read(partnerRepositoryProvider).cancelLead(lead.kind, lead.id);
      ref.invalidate(myPartnerLeadsProvider);
      if (mounted) showInfoSnack(context, context.l10n.insuranceWithdrawn);
    } on Object catch (e) {
      if (mounted) showInfoSnack(context, partnerErrorMessage(context.l10n, e));
    } finally {
      if (mounted) setState(() => _withdrawing.remove(lead.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return DefaultTabController(
      length: InsuranceTab.values.length,
      initialIndex: widget.initialTab.index,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.insuranceScreenTitle),
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(key: const ValueKey('tab-insurance'), text: l10n.insuranceTabInsurance),
              Tab(key: const ValueKey('tab-pay-later'), text: l10n.insuranceTabPayLater),
              Tab(key: const ValueKey('tab-requests'), text: l10n.insuranceTabRequests),
            ],
          ),
        ),
        body: TabBarView(children: [_offerings(PartnerKind.insurance), _offerings(PartnerKind.payLater), _requests()]),
      ),
    );
  }

  Widget _countryRow() {
    final l10n = context.l10n;
    final c = _countryIn();
    return Semantics(
      button: true,
      child: InkWell(
        key: const ValueKey('insurance-country'),
        borderRadius: BorderRadius.circular(AppRadius.sm),
        onTap: _pickCountry,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Row(
            children: [
              if (c != null) ...[
                ExcludeSemantics(child: Text(countryFlag(c), style: const TextStyle(fontSize: 22))),
                const SizedBox(width: 8),
              ],
              Expanded(
                child: Text(
                  c == null ? l10n.insuranceCountryAll : l10n.insuranceCountryFor(countryName(c, l10n)),
                  style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              Text(l10n.costHomeChange, style: context.text.labelLarge?.copyWith(color: AppColors.primary)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _offerings(PartnerKind kind) {
    final l10n = context.l10n;
    final country = _countryIn();
    final provider = kind == PartnerKind.insurance
        ? insuranceProductsProvider(country)
        : financingPartnersProvider(country);
    final value = ref.watch(provider);
    final insurance = kind == PartnerKind.insurance;
    return RefreshIndicator(
      onRefresh: () => ref.refresh(provider.future),
      child: ListView(
        key: PageStorageKey('offerings-${kind.json}'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 32),
        children: [
          PartnerDisclaimer(
            key: ValueKey('disclaimer-${kind.json}'),
            text: insurance ? l10n.insuranceDisclaimer : l10n.financingDisclaimer,
          ),
          if (!insurance) ...[
            const SizedBox(height: 8),
            Text(l10n.financingPartnerDecides, style: context.text.bodySmall),
          ],
          const SizedBox(height: 8),
          _countryRow(),
          const SizedBox(height: 8),
          value.when(
            skipLoadingOnRefresh: true,
            loading: () => const Padding(padding: EdgeInsets.all(32), child: LoadingView()),
            error: (e, _) => ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(provider)),
            data: (items) => items.isEmpty
                ? EmptyView(
                    icon: insurance ? Icons.health_and_safety_outlined : Icons.account_balance_wallet_outlined,
                    title: insurance ? l10n.insuranceEmptyTitle : l10n.financingEmptyTitle,
                    message: insurance ? l10n.insuranceEmptyBody : l10n.financingEmptyBody,
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final o in items)
                        PartnerOfferingCard(offering: o, country: country, onRequest: () => _request(o)),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _requests() {
    final l10n = context.l10n;
    final value = ref.watch(myPartnerLeadsProvider);
    return RefreshIndicator(
      onRefresh: () => ref.refresh(myPartnerLeadsProvider.future),
      child: ListView(
        key: const PageStorageKey('partner-requests'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 32),
        children: [
          value.when(
            skipLoadingOnRefresh: true,
            loading: () => const Padding(padding: EdgeInsets.all(32), child: LoadingView()),
            error: (e, _) => ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(myPartnerLeadsProvider)),
            data: (leads) => leads.isEmpty
                ? EmptyView(
                    icon: Icons.inbox_outlined,
                    title: l10n.insuranceRequestsEmptyTitle,
                    message: l10n.insuranceRequestsEmptyBody,
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final lead in leads)
                        PartnerLeadTile(
                          lead: lead,
                          busy: _withdrawing.contains(lead.id),
                          onWithdraw: () => _withdraw(lead),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
