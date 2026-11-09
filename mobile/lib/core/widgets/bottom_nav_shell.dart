import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Bottom navigation tab definition.
class NavTab {
  const NavTab({required this.label, required this.icon, required this.selectedIcon});

  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

/// The five patient tabs (order = StatefulShellRoute branch order).
const List<NavTab> kNavTabs = [
  NavTab(label: 'Home', icon: Icons.home_outlined, selectedIcon: Icons.home_rounded),
  NavTab(label: 'Search', icon: Icons.search_rounded, selectedIcon: Icons.search_rounded),
  NavTab(label: 'Trips', icon: Icons.flight_takeoff_outlined, selectedIcon: Icons.flight_takeoff_rounded),
  NavTab(label: 'Messages', icon: Icons.chat_bubble_outline_rounded, selectedIcon: Icons.chat_bubble_rounded),
  NavTab(label: 'Profile', icon: Icons.person_outline_rounded, selectedIcon: Icons.person_rounded),
];

/// Scaffold with the Home · Search · Trips · Messages · Profile bottom bar around a
/// go_router [StatefulNavigationShell].
class BottomNavShell extends StatelessWidget {
  const BottomNavShell({super.key, required this.navigationShell, this.badges = const {}});

  final StatefulNavigationShell navigationShell;

  /// Badge counts by tab index (e.g. `{3: unreadCount}`).
  final Map<int, int> badges;

  void _onTap(int index) {
    // Re-tapping the active tab pops it back to its root.
    navigationShell.goBranch(index, initialLocation: index == navigationShell.currentIndex);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: _onTap,
        destinations: [
          for (var i = 0; i < kNavTabs.length; i++)
            NavigationDestination(
              label: kNavTabs[i].label,
              tooltip: kNavTabs[i].label,
              icon: _badged(Icon(kNavTabs[i].icon), badges[i] ?? 0),
              selectedIcon: _badged(Icon(kNavTabs[i].selectedIcon), badges[i] ?? 0),
            ),
        ],
      ),
    );
  }

  Widget _badged(Widget icon, int count) {
    if (count <= 0) return icon;
    return Badge(label: Text(count > 99 ? '99+' : '$count'), child: icon);
  }
}
