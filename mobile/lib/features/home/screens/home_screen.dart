import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_controller.dart';
import '../../../core/config/app_preferences.dart';
import '../../../core/models/models.dart';
import '../../../core/repositories/catalog_repository.dart';
import '../../../core/repositories/patient_repository.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/widgets.dart';
import '../../../l10n/l10n.dart';
import '../widgets/home_banners.dart';
import '../widgets/specialty_tile.dart';

/// Number of specialty tiles before the "More" tile (design: 5 + More).
const _visibleSpecialties = 5;

/// Service Category Selection "What brings you to India?": search bar, specialty grid with
/// savings %, upcoming-trip banner. Tapping a specialty starts a screening for it.
///
/// Route: `/home (tab)` · Owner: fl-onboarding.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _startScreening(Specialty s) => context.push(Routes.screeningStart(specialty: s.slug));

  void _submitSearch(String q) {
    final query = q.trim();
    context.go(query.isEmpty ? Routes.search : Routes.searchFor(q: query));
  }

  Future<void> _refresh() async {
    ref.invalidate(specialtiesProvider);
    if (ref.read(authStateProvider).hasSession) ref.invalidate(patientDashboardProvider);
    await ref.read(specialtiesProvider.future).catchError((_) => const <Specialty>[]);
  }

  void _showAll(List<Specialty> all) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (context, controller) => Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Row(
                children: [
                  Expanded(child: Text(context.l10n.homeAllSpecialties, style: context.text.titleLarge)),
                  Text('${all.length}', style: context.text.labelMedium),
                ],
              ),
            ),
            Expanded(
              child: GridView.builder(
                controller: controller,
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 240,
                  mainAxisExtent: 128,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                ),
                itemCount: all.length,
                itemBuilder: (context, i) => SpecialtyTile.specialty(
                  all[i],
                  accent: specialtyAccent(i),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _startScreening(all[i]);
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final auth = ref.watch(authStateProvider);
    final specialties = ref.watch(specialtiesProvider);
    final dashboard = auth.hasSession ? ref.watch(patientDashboardProvider).value : null;
    if (auth.isAuthenticated) {
      // After login, adopt the patient's server-side display currency (PLAN §4.2 preferred_currency).
      ref.listen(patientProfileProvider, (_, next) {
        final ccy = next.value?.preferredCurrency.toUpperCase();
        if (ccy != null && ccy.length == 3 && ccy != ref.read(preferredCurrencyProvider)) {
          ref.read(preferredCurrencyProvider.notifier).set(ccy);
        }
      });
    }

    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          child: CustomScrollView(
            slivers: [
              const SliverToBoxAdapter(child: BrandHeader()),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                sliver: SliverList.list(
                  children: [
                    Semantics(header: true, child: Text(l10n.homeTitle, style: context.text.headlineSmall)),
                    const SizedBox(height: 4),
                    Text(
                      l10n.homeSubtitle,
                      style: context.text.bodySmall?.copyWith(color: context.palette.textSecondary),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _search,
                      textInputAction: TextInputAction.search,
                      onSubmitted: _submitSearch,
                      decoration: InputDecoration(
                        hintText: l10n.homeSearchHint,
                        prefixIcon: const Icon(Icons.search_rounded),
                        isDense: true,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                          borderSide: BorderSide.none,
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                          borderSide: BorderSide.none,
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                          borderSide: const BorderSide(color: AppColors.primary),
                        ),
                        suffixIcon: IconButton(
                          tooltip: l10n.homeSearchButton,
                          icon: const Icon(Icons.arrow_forward_rounded),
                          onPressed: () => _submitSearch(_search.text),
                        ),
                      ),
                    ),
                    ..._banners(dashboard),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
              ...specialties.when(
                loading: () => [const SliverFillRemaining(hasScrollBody: false, child: LoadingView())],
                error: (e, _) => [
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: ErrorView(error: e, onRetry: () => ref.invalidate(specialtiesProvider)),
                  ),
                ],
                data: (all) => all.isEmpty
                    ? [
                        SliverFillRemaining(
                          hasScrollBody: false,
                          child: EmptyView(
                            icon: Icons.medical_services_outlined,
                            title: l10n.homeNoSpecialtiesTitle,
                            message: l10n.homeNoSpecialtiesMessage,
                            actionLabel: l10n.homeSearchButton,
                            onAction: () => context.go(Routes.search),
                          ),
                        ),
                      ]
                    : [_grid(all), const SliverToBoxAdapter(child: SizedBox(height: 24))],
              ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _banners(PatientDashboard? dashboard) {
    if (dashboard == null) return const [];
    final booking = dashboard.nextBooking;
    if (booking != null) {
      return [
        const SizedBox(height: 14),
        UpcomingTripBanner(booking: booking, daysUntil: dashboard.daysUntilTreatment),
      ];
    }
    final recent = dashboard.recentScreenings.isEmpty ? null : dashboard.recentScreenings.first;
    if (recent != null && recent.status != ScreeningStatus.failed) {
      return [const SizedBox(height: 14), ScreeningResumeBanner(screening: recent)];
    }
    return const [];
  }

  Widget _grid(List<Specialty> all) {
    final showMore = all.length > _visibleSpecialties + 1;
    final visible = showMore ? all.take(_visibleSpecialties).toList() : all;
    final rest = showMore ? all.skip(_visibleSpecialties) : const <Specialty>[];
    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      sliver: SliverGrid(
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 240,
          mainAxisExtent: 128,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        delegate: SliverChildBuilderDelegate((context, i) {
          if (i < visible.length) {
            return SpecialtyTile.specialty(
              visible[i],
              accent: specialtyAccent(i),
              onTap: () => _startScreening(visible[i]),
            );
          }
          final l10n = context.l10n;
          return SpecialtyTile(
            title: l10n.homeMoreTile,
            subtitle: l10n.homeMoreTileSubtitle,
            icon: Icons.add_circle_outline_rounded,
            accent: specialtyAccent(5),
            savingsLabel: combinedSavingsLabel(rest, l10n: l10n),
            onTap: () => _showAll(all),
          );
        }, childCount: visible.length + (showMore ? 1 : 0)),
      ),
    );
  }
}
