import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../services/journey_actions.dart';

/// Bottom sheet listing the 24/7 helpline, WhatsApp, local emergency number, the case coordinator
/// and the patient's own emergency contact.
Future<void> showEmergencyContactsSheet(BuildContext context, {Coordinator? coordinator}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => _EmergencyContacts(coordinator: coordinator),
  );
}

class _EmergencyContacts extends ConsumerWidget {
  const _EmergencyContacts({this.coordinator});

  final Coordinator? coordinator;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final helplines = ref.watch(helplinesProvider);
    final profile = ref.watch(patientProfileProvider).value;
    final contact = profile?.emergencyContact;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            Text('Emergency Contacts', style: context.text.titleLarge),
            const SizedBox(height: 4),
            Text(
              'In a medical emergency in India call the local emergency number first.',
              style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
            ),
            const SizedBox(height: 12),
            helplines.when(
              loading: () => const Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
              error: (e, _) => ErrorView(error: e, compact: true, onRetry: () => ref.invalidate(helplinesProvider)),
              data: (h) => Column(
                children: [
                  _ContactTile(
                    icon: Icons.emergency_rounded,
                    color: AppColors.danger,
                    title: 'Emergency services (India)',
                    number: h.emergency,
                  ),
                  if (h.support24x7 != null)
                    _ContactTile(
                      icon: Icons.support_agent_rounded,
                      color: AppColors.violet,
                      title: 'Heal India Global 24/7 helpline',
                      number: h.support24x7!,
                    ),
                  if (h.whatsapp != null)
                    _ContactTile(
                      icon: Icons.chat_rounded,
                      color: AppColors.primary,
                      title: 'WhatsApp support',
                      number: h.whatsapp!,
                      whatsapp: true,
                    ),
                  for (final e in h.numbers.entries)
                    if (!const {'24x7', 'whatsapp', 'emergency'}.contains(e.key))
                      _ContactTile(
                        icon: Icons.phone_rounded,
                        color: AppColors.info,
                        title: _titleCase(e.key),
                        number: e.value,
                      ),
                ],
              ),
            ),
            if (coordinator?.phone != null)
              _ContactTile(
                icon: Icons.badge_rounded,
                color: AppColors.cyan,
                title: 'Coordinator - ${coordinator!.fullName}',
                number: coordinator!.phone!,
              ),
            if (contact != null && !contact.isEmpty && contact.phone != null)
              _ContactTile(
                icon: Icons.family_restroom_rounded,
                color: AppColors.warning,
                title: [contact.name ?? 'My emergency contact', ?contact.relationship].join(' · '),
                number: contact.phone!,
              ),
          ],
        ),
      ),
    );
  }

  static String _titleCase(String key) => key
      .replaceAll('_', ' ')
      .split(' ')
      .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}

class _ContactTile extends StatelessWidget {
  const _ContactTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.number,
    this.whatsapp = false,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String number;
  final bool whatsapp;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      onTap: () => whatsapp ? openWhatsApp(context, number) : callNumber(context, number),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.15),
          child: Icon(icon, color: color),
        ),
        title: Text(title),
        subtitle: Text(number),
        trailing: Icon(whatsapp ? Icons.open_in_new_rounded : Icons.call_rounded, color: color),
      ),
    );
  }
}
