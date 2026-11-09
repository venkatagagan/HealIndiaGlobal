import 'package:flutter/material.dart';

import 'screens/agent_bookings_screens.dart';
import 'screens/agent_cases_screens.dart';
import 'screens/agent_dashboard_screen.dart';
import 'screens/agent_earnings_screen.dart';
import 'screens/agent_patients_screens.dart';
import 'shared/portal_widgets.dart';

/// Agent / facilitator shell (`/agent`, PLAN §3.1): bottom navigation with
/// Dashboard · Patients · Cases · Bookings · Earnings. Detail pages are pushed as `/agent/...`
/// routes above the shell (see `agent_routes.dart`).
class AgentShell extends StatelessWidget {
  const AgentShell({super.key, this.initialTab = 0});

  /// Selected tab on first build (`/agent?tab=<index>`).
  final int initialTab;

  static const tabs = [
    PortalTab(
      label: 'Dashboard',
      icon: Icons.space_dashboard_outlined,
      selectedIcon: Icons.space_dashboard_rounded,
      builder: _dashboard,
    ),
    PortalTab(label: 'Patients', icon: Icons.groups_outlined, selectedIcon: Icons.groups_rounded, builder: _patients),
    PortalTab(label: 'Cases', icon: Icons.folder_shared_outlined, selectedIcon: Icons.folder_shared, builder: _cases),
    PortalTab(
      label: 'Bookings',
      icon: Icons.event_available_outlined,
      selectedIcon: Icons.event_available_rounded,
      builder: _bookings,
    ),
    PortalTab(
      label: 'Earnings',
      icon: Icons.account_balance_wallet_outlined,
      selectedIcon: Icons.account_balance_wallet_rounded,
      builder: _earnings,
    ),
  ];

  static Widget _dashboard(BuildContext _) => const AgentDashboardScreen();
  static Widget _patients(BuildContext _) => const AgentPatientsScreen();
  static Widget _cases(BuildContext _) => const AgentCasesScreen();
  static Widget _bookings(BuildContext _) => const AgentBookingsScreen();
  static Widget _earnings(BuildContext _) => const AgentEarningsScreen();

  @override
  Widget build(BuildContext context) =>
      PortalShellScaffold(key: ValueKey('agent-shell-$initialTab'), tabs: tabs, initialIndex: initialTab);
}
