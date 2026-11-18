import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/partner_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../profile/data/countries.dart';
import '../../profile/widgets/country_picker_sheet.dart';
import 'partner_widgets.dart';

/// Opens the "Request a quote from the insurer" / "Check eligibility" form for [offering]. Returns the
/// created request, or null when the sheet was closed without sending.
Future<PartnerLead?> showPartnerLeadSheet(
  BuildContext context, {
  required PartnerOffering offering,
  String? country,
  String? caseId,
  String? bookingId,
}) => showModalBottomSheet<PartnerLead>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  builder: (_) => PartnerLeadSheet(offering: offering, country: country, caseId: caseId, bookingId: bookingId),
);

/// Contact form sent to a partner (`LeadCreate`): name, email and/or phone, preferred contact, country,
/// an optional message (no medical details) and the required consent to share the contact details with
/// that partner. After sending it shows the partner hand-off link.
class PartnerLeadSheet extends ConsumerStatefulWidget {
  const PartnerLeadSheet({super.key, required this.offering, this.country, this.caseId, this.bookingId});

  final PartnerOffering offering;
  final String? country;
  final String? caseId;
  final String? bookingId;

  @override
  ConsumerState<PartnerLeadSheet> createState() => _PartnerLeadSheetState();
}

class _PartnerLeadSheetState extends ConsumerState<PartnerLeadSheet> {
  static final _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _message = TextEditingController();
  PreferredContact? _preferred;
  String? _country;
  bool _consent = false;
  bool _busy = false;
  bool _validate = false;
  String? _error;
  PartnerLead? _sent;

  @override
  void initState() {
    super.initState();
    final user = ref.read(authStateProvider).user;
    if (user != null) {
      _name.text = user.fullName.trim();
      _email.text = user.email ?? '';
      _phone.text = user.phone ?? '';
    }
    _country = widget.country ?? user?.countryCode?.toUpperCase();
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _message.dispose();
    super.dispose();
  }

  bool get _insurance => widget.offering.kind == PartnerKind.insurance;

  String? _nameError(AppLocalizations l10n) => _name.text.trim().isEmpty ? l10n.insuranceNameRequired : null;

  String? _emailError(AppLocalizations l10n) {
    final e = _email.text.trim();
    if (e.isNotEmpty && !_emailPattern.hasMatch(e)) return l10n.insuranceEmailInvalid;
    return null;
  }

  bool get _hasContact => _email.text.trim().isNotEmpty || _phone.text.trim().isNotEmpty;

  Future<void> _pickCountry() async {
    final choice = await showCountryPicker(context, selected: _country, title: context.l10n.insuranceCountryPick);
    if (choice?.code != null && mounted) setState(() => _country = choice!.code!.toUpperCase());
  }

  Future<void> _send() async {
    final l10n = context.l10n;
    setState(() => _validate = true);
    if (_nameError(l10n) != null || _emailError(l10n) != null || !_hasContact || !_consent) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final lead = await ref
          .read(partnerRepositoryProvider)
          .createLead(
            widget.offering.kind,
            PartnerLeadRequest(
              offeringId: widget.offering.id,
              caseId: widget.caseId,
              bookingId: widget.bookingId,
              contactName: _name.text,
              contactEmail: _email.text,
              contactPhone: _phone.text,
              preferredContact: _preferred,
              country: _country,
              message: _message.text,
              consentShareContact: _consent,
            ),
          );
      ref.invalidate(myPartnerLeadsProvider);
      if (mounted) setState(() => _sent = lead);
    } on Object catch (e) {
      if (mounted) setState(() => _error = partnerErrorMessage(context.l10n, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsetsDirectional.only(bottom: inset),
      child: SingleChildScrollView(
        padding: const EdgeInsetsDirectional.fromSTEB(20, 8, 20, 24),
        child: _sent == null ? _form(context) : _success(context, _sent!),
      ),
    );
  }

  Widget _form(BuildContext context) {
    final l10n = context.l10n;
    final o = widget.offering;
    final contactMissing = _validate && !_hasContact;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(
            _insurance ? l10n.insuranceFormTitle : l10n.financingFormTitle,
            style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(height: 4),
        Text('${o.providerName} · ${o.productName}', style: context.text.titleSmall),
        const SizedBox(height: 8),
        Text(
          _insurance ? l10n.insuranceFormIntro(o.providerName) : l10n.financingFormIntro(o.providerName),
          style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
        ),
        if (!_insurance) ...[
          const SizedBox(height: 8),
          Text(l10n.financingPartnerDecides, style: context.text.bodySmall),
        ],
        const SizedBox(height: 16),
        TextField(
          key: const ValueKey('lead-name'),
          controller: _name,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.name],
          maxLength: 200,
          decoration: InputDecoration(
            labelText: l10n.insuranceFieldName,
            errorText: _validate ? _nameError(l10n) : null,
            counterText: '',
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('lead-email'),
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.email],
          decoration: InputDecoration(
            labelText: l10n.insuranceFieldEmail,
            errorText: _validate
                ? (_emailError(l10n) ?? (contactMissing ? l10n.insuranceContactRequired : null))
                : null,
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('lead-phone'),
          controller: _phone,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.next,
          autofillHints: const [AutofillHints.telephoneNumber],
          maxLength: 32,
          decoration: InputDecoration(
            labelText: l10n.insuranceFieldPhone,
            errorText: contactMissing ? l10n.insuranceContactRequired : null,
            counterText: '',
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 12),
        Semantics(header: true, child: Text(l10n.insurancePreferredContact, style: context.text.labelLarge)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final c in PreferredContact.values)
              ChoiceChip(
                key: ValueKey('lead-preferred-${c.json}'),
                label: Text(switch (c) {
                  PreferredContact.email => l10n.insuranceContactEmail,
                  PreferredContact.phone => l10n.insuranceContactPhone,
                  PreferredContact.whatsapp => l10n.insuranceContactWhatsapp,
                }),
                selected: _preferred == c,
                onSelected: (on) => setState(() => _preferred = on ? c : null),
              ),
          ],
        ),
        const SizedBox(height: 12),
        Semantics(
          button: true,
          child: InkWell(
            key: const ValueKey('lead-country'),
            borderRadius: BorderRadius.circular(AppRadius.sm),
            onTap: _pickCountry,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          l10n.insuranceFieldCountry,
                          style: context.text.labelMedium?.copyWith(color: context.palette.textSecondary),
                        ),
                        Text(
                          _country == null
                              ? l10n.insuranceFieldCountryNotSet
                              : '${countryFlag(_country)} ${countryName(_country, l10n)}',
                          style: context.text.bodyLarge,
                        ),
                      ],
                    ),
                  ),
                  Text(l10n.costHomeChange, style: context.text.labelLarge?.copyWith(color: AppColors.primary)),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('lead-message'),
          controller: _message,
          minLines: 2,
          maxLines: 4,
          maxLength: 1000,
          decoration: InputDecoration(labelText: l10n.insuranceFieldMessage, helperText: l10n.insuranceMessageHint),
        ),
        if (widget.caseId != null || widget.bookingId != null) ...[
          const SizedBox(height: 4),
          Text(
            l10n.insuranceLinkedToBooking,
            style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
          ),
        ],
        const SizedBox(height: 8),
        CheckboxListTile(
          key: const ValueKey('lead-consent'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _consent,
          onChanged: (v) => setState(() => _consent = v ?? false),
          title: Text(l10n.insuranceConsentText(o.providerName), style: context.text.bodySmall),
          subtitle: _validate && !_consent
              ? Text(l10n.insuranceConsentRequired, style: TextStyle(color: context.colors.error))
              : null,
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Semantics(
            liveRegion: true,
            child: Text(
              _error!,
              key: const ValueKey('lead-error'),
              style: context.text.bodyMedium?.copyWith(color: context.colors.error),
            ),
          ),
        ],
        const SizedBox(height: 16),
        PrimaryButton(
          key: const ValueKey('lead-send'),
          label: l10n.insuranceSend,
          icon: Icons.send_rounded,
          loading: _busy,
          onPressed: _busy ? null : _send,
        ),
      ],
    );
  }

  Widget _success(BuildContext context, PartnerLead lead) {
    final l10n = context.l10n;
    final url = lead.partnerWebsiteUrl ?? widget.offering.websiteUrl;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),
        const ExcludeSemantics(child: Icon(Icons.check_circle_rounded, size: 56, color: AppColors.primary)),
        const SizedBox(height: 12),
        Semantics(
          header: true,
          liveRegion: true,
          child: Text(
            l10n.insuranceSentTitle,
            textAlign: TextAlign.center,
            style: context.text.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(height: 8),
        Text(l10n.insuranceSentBody(lead.providerName), textAlign: TextAlign.center, style: context.text.bodyMedium),
        const SizedBox(height: 20),
        if ((url ?? '').isNotEmpty) ...[
          PrimaryButton(
            key: const ValueKey('lead-continue'),
            label: l10n.insuranceContinueOnPartner,
            icon: Icons.open_in_new_rounded,
            onPressed: () => openPartnerLink(context, ref, url),
          ),
          const SizedBox(height: 10),
        ],
        SecondaryButton(
          key: const ValueKey('lead-done'),
          label: l10n.commonDone,
          onPressed: () => Navigator.of(context).pop(lead),
        ),
      ],
    );
  }
}
