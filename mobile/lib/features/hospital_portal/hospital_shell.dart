import 'package:flutter/material.dart';

import '../../l10n/l10n.dart';
import '../agent_portal/shared/payee_finance_view.dart';
import '../agent_portal/shared/portal_widgets.dart';
import 'screens/hospital_bookings_screens.dart';
import 'screens/hospital_cases_screens.dart';
import 'screens/hospital_dashboard_screen.dart';
import 'screens/hospital_more_screens.dart';

/// Hospital user shell (`/hospital`, PLAN §3.1): bottom navigation with
/// Dashboard · Enquiries · Patients (admissions / discharges) · Settlements · More.
/// Detail pages are pushed as `/hospital/...` routes above the shell (see `hospital_routes.dart`).
class HospitalShell extends StatelessWidget {
  const HospitalShell({super.key, this.initialTab = 0});

  /// Selected tab on first build (`/hospital?tab=<index>`).
  final int initialTab;

  /// Bottom-navigation tabs, labelled in the current language.
  static const tabs = [
    PortalTab(
      labelBuilder: _dashboardLabel,
      icon: Icons.space_dashboard_outlined,
      selectedIcon: Icons.space_dashboard_rounded,
      builder: _dashboard,
    ),
    PortalTab(
      labelBuilder: _enquiriesLabel,
      icon: Icons.inbox_outlined,
      selectedIcon: Icons.inbox_rounded,
      builder: _enquiries,
    ),
    PortalTab(
      labelBuilder: _patientsLabel,
      icon: Icons.local_hospital_outlined,
      selectedIcon: Icons.local_hospital_rounded,
      builder: _patients,
    ),
    PortalTab(
      labelBuilder: _settlementsLabel,
      icon: Icons.account_balance_outlined,
      selectedIcon: Icons.account_balance_rounded,
      builder: _settlements,
    ),
    PortalTab(
      labelBuilder: _moreLabel,
      icon: Icons.grid_view_outlined,
      selectedIcon: Icons.grid_view_rounded,
      builder: _more,
    ),
  ];

  static String _dashboardLabel(AppLocalizations l) => l.hpTabDashboard;
  static String _enquiriesLabel(AppLocalizations l) => l.hpTabEnquiries;
  static String _patientsLabel(AppLocalizations l) => l.hpTabPatients;
  static String _settlementsLabel(AppLocalizations l) => l.hpTabSettlements;
  static String _moreLabel(AppLocalizations l) => l.hpTabMore;

  static Widget _dashboard(BuildContext _) => const HospitalDashboardScreen();
  static Widget _enquiries(BuildContext _) => const EnquiriesScreen();
  static Widget _patients(BuildContext _) => const AdmissionsScreen();
  static Widget _settlements(BuildContext context) => PayeeFinanceView(title: context.l10n.hpSettlementsTitle);
  static Widget _more(BuildContext _) => const HospitalMoreScreen();

  @override
  Widget build(BuildContext context) =>
      PortalShellScaffold(key: ValueKey('hospital-shell-$initialTab'), tabs: tabs, initialIndex: initialTab);
}
