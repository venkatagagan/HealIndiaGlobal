import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/document_repository.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/repositories/travel_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../../profile/data/countries.dart';
import '../../profile/widgets/country_picker_sheet.dart';
import '../services/file_actions.dart';

/// The nationality the visa guide opens with: the patient's nationality, else the account / home country.
final defaultNationalityProvider = Provider.autoDispose<String?>((ref) {
  final auth = ref.watch(authStateProvider);
  if (auth.isAuthenticated && auth.user?.role == UserRole.patient) {
    final n = ref.watch(patientProfileProvider).value?.nationality;
    if (n != null && n.length == 2) return n.toUpperCase();
  }
  final c = auth.user?.countryCode;
  if (c != null && c.length == 2) return c.toUpperCase();
  return ref.watch(homeCountryProvider);
});

/// Visa guide for treatment in India by nationality (`GET /travel/visa-guide`): the route (e-Visa /
/// regular embassy visa / no visa), a checklist the patient ticks off (kept on this device), processing
/// time, attendants allowed, the official link, and the hospital's invitation letter once issued.
///
/// Route: `/visa-guide?nationality=XX` (also pushed from a trip with [caseId]).
class VisaGuideScreen extends ConsumerStatefulWidget {
  const VisaGuideScreen({super.key, this.nationality, this.caseId});

  final String? nationality;
  final String? caseId;

  @override
  ConsumerState<VisaGuideScreen> createState() => _VisaGuideScreenState();
}

class _VisaGuideScreenState extends ConsumerState<VisaGuideScreen> {
  String? _nationality;

  String _prefKey(String nat) => 'hig.visa_checklist.${nat.toUpperCase()}';

  Set<String> _ticked(String nat) =>
      (ref.read(sharedPreferencesProvider).getStringList(_prefKey(nat)) ?? const <String>[]).toSet();

  Future<void> _toggle(String nat, String itemKey, bool on) async {
    final set = _ticked(nat);
    on ? set.add(itemKey) : set.remove(itemKey);
    await ref.read(sharedPreferencesProvider).setStringList(_prefKey(nat), set.toList());
    if (mounted) setState(() {});
  }

  Future<void> _pickCountry(String? current) async {
    final choice = await showCountryPicker(context, selected: current, title: context.l10n.visaGuidePickNationality);
    if (choice?.code != null && mounted) setState(() => _nationality = choice!.code);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final nat = (_nationality ?? widget.nationality ?? ref.watch(defaultNationalityProvider))?.toUpperCase();
    return Scaffold(
      appBar: AppBar(title: Text(l10n.visaGuideTitle)),
      body: nat == null
          ? EmptyView(
              icon: Icons.flag_outlined,
              title: l10n.visaGuidePickNationality,
              message: l10n.visaGuidePickMessage,
              actionLabel: l10n.countryPickerTitle,
              onAction: () => _pickCountry(null),
            )
          : RefreshIndicator(
              onRefresh: () => ref.refresh(visaGuideProvider(nat).future),
              child: AsyncValueView<VisaGuide>(
                value: ref.watch(visaGuideProvider(nat)),
                onRetry: () => ref.invalidate(visaGuideProvider(nat)),
                data: (g) => _guide(context, g, nat),
              ),
            ),
    );
  }

  Widget _guide(BuildContext context, VisaGuide g, String nat) {
    final l10n = context.l10n;
    final ticked = _ticked(nat);
    final done = g.checklist.where((i) => ticked.contains(i.itemKey)).length;
    final (routeTitle, routeBody, routeIcon) = switch (g.visaRoute) {
      'e_visa' => (l10n.visaGuideRouteEvisa, l10n.visaGuideRouteEvisaBody, Icons.language_rounded),
      'not_required' => (l10n.visaGuideRouteNone, l10n.visaGuideRouteNoneBody, Icons.check_circle_outline_rounded),
      _ => (l10n.visaGuideRouteRegular, l10n.visaGuideRouteRegularBody, Icons.account_balance_outlined),
    };
    final url = Uri.tryParse(g.officialUrl ?? '');
    final letters = widget.caseId == null
        ? const <VisaRequest>[]
        : (ref.watch(visaRequestsProvider(widget.caseId)).value ?? const <VisaRequest>[])
              .where((v) => v.invitationLetterDocumentId != null)
              .toList();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        InkWell(
          key: const ValueKey('visa-guide-country'),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          onTap: () => _pickCountry(nat),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 48),
            child: Row(
              children: [
                Text(countryFlag(nat), style: const TextStyle(fontSize: 22)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.visaGuideFor(countryName(nat, l10n)),
                    style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(l10n.costHomeChange, style: context.text.labelLarge?.copyWith(color: AppColors.primary)),
              ],
            ),
          ),
        ),
        if (g.isDefault)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: AppCard(
              color: AppColors.warning.withValues(alpha: 0.12),
              borderColor: AppColors.warning.withValues(alpha: 0.4),
              padding: const EdgeInsets.all(12),
              child: Text(l10n.visaGuideDefaultNote, style: context.text.bodySmall),
            ),
          ),
        const SizedBox(height: 12),
        AppCard(
          key: const ValueKey('visa-guide-route'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(routeIcon, color: AppColors.primary, size: 28),
                  const SizedBox(width: 10),
                  Expanded(child: Text(routeTitle, style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
                ],
              ),
              const SizedBox(height: 8),
              Text(routeBody, style: context.text.bodyMedium),
              const Divider(height: 24),
              if (g.typicalProcessingDays != null)
                _fact(context, Icons.timer_outlined, l10n.visaGuideProcessing(g.typicalProcessingDays!)),
              if (g.visaRoute != 'not_required')
                _fact(context, Icons.group_outlined, l10n.visaGuideAttendants(g.maxAttendants)),
              if ((g.notes ?? '').isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(g.notes!, style: context.text.bodySmall),
              ],
              if (url != null && url.scheme == 'https') ...[
                const SizedBox(height: 10),
                SecondaryButton(
                  key: const ValueKey('visa-guide-official'),
                  label: l10n.visaGuideOfficial,
                  icon: Icons.open_in_new_rounded,
                  onPressed: () => launchUrl(url, mode: LaunchMode.externalApplication),
                ),
              ],
            ],
          ),
        ),
        for (final v in letters)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: PrimaryButton(
              key: ValueKey('visa-letter-${v.id}'),
              label: l10n.visaInvitationLetter,
              icon: Icons.mark_email_read_outlined,
              onPressed: () async {
                final repo = ref.read(documentRepositoryProvider);
                try {
                  final doc = await repo.get(v.invitationLetterDocumentId!);
                  if (context.mounted) await openDocument(context, repo, doc);
                } on Object catch (e) {
                  if (context.mounted) showErrorSnack(context, e);
                }
              },
            ),
          ),
        if (g.checklist.isNotEmpty) ...[
          SectionTitle(l10n.visaGuideChecklist, subtitle: l10n.visaGuideChecklistProgress(done, g.checklist.length)),
          AppCard(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: Column(
              children: [
                for (final item in g.checklist)
                  CheckboxListTile(
                    key: ValueKey('visa-item-${item.itemKey}'),
                    value: ticked.contains(item.itemKey),
                    onChanged: (v) => _toggle(nat, item.itemKey, v ?? false),
                    controlAffinity: ListTileControlAffinity.leading,
                    title: Text(item.title),
                    subtitle: Text(
                      [if (!item.required) l10n.visaGuideOptional, ?item.description].join(' · '),
                    ),
                  ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 12),
        Text(l10n.visaGuideDisclaimer, style: context.text.labelSmall?.copyWith(color: context.palette.textSecondary)),
      ],
    );
  }

  Widget _fact(BuildContext context, IconData icon, String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      children: [
        Icon(icon, size: 18, color: context.palette.textSecondary),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: context.text.bodyMedium)),
      ],
    ),
  );
}
