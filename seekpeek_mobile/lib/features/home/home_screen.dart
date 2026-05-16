import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/theme_provider.dart';
import 'widgets/hero_banner.dart';
import 'widgets/stat_card_row.dart';
import 'widgets/project_carousel.dart';
import 'widgets/team_activity.dart';
import 'widgets/up_next_list.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;

    return SafeArea(
      bottom: false,
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            sliver: SliverToBoxAdapter(child: _Header(dark: dark)),
          ),
          const SliverPadding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
            sliver: SliverToBoxAdapter(child: HeroBanner()),
          ),
          const SliverPadding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 0),
            sliver: SliverToBoxAdapter(child: StatCardRow()),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            sliver: SliverToBoxAdapter(
              child: _SectionHeader(
                title: 'Projects',
                action: 'See all',
                dark: dark,
              ),
            ),
          ),
          const SliverPadding(
            padding: EdgeInsets.only(top: 10),
            sliver: SliverToBoxAdapter(child: ProjectCarousel()),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            sliver: SliverToBoxAdapter(
              child: _SectionHeader(
                title: 'Team activity',
                action: 'View all',
                dark: dark,
              ),
            ),
          ),
          const SliverPadding(
            padding: EdgeInsets.fromLTRB(16, 10, 16, 0),
            sliver: SliverToBoxAdapter(child: TeamActivity()),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
            sliver: SliverToBoxAdapter(
              child: _SectionHeader(title: 'Up next', dark: dark),
            ),
          ),
          const SliverPadding(
            padding: EdgeInsets.fromLTRB(16, 10, 16, 100),
            sliver: SliverToBoxAdapter(child: UpNextList()),
          ),
        ],
      ),
    );
  }
}

// ── Header row ──
class _Header extends StatelessWidget {
  final bool dark;
  const _Header({required this.dark});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Friday, May 16',
                style: AppTypography.bodySm.copyWith(
                  color: dark ? AppColors.darkText4 : AppColors.lightText4,
                ),
              ),
              Text(
                'Good morning, Amit',
                style: AppTypography.title.copyWith(
                  color: dark ? Colors.white : AppColors.lightText,
                ),
              ),
            ],
          ),
        ),
        Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [AppColors.accent, AppColors.accentLight],
                ),
              ),
              alignment: Alignment.center,
              child: const Text(
                'A',
                style: TextStyle(
                  fontFamily: 'Poppins',
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
            Positioned(
              top: -2,
              right: -2,
              child: Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: AppColors.danger,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: dark ? AppColors.darkBg : AppColors.lightBg,
                    width: 2,
                  ),
                ),
                alignment: Alignment.center,
                child: const Text(
                  '3',
                  style: TextStyle(
                    fontSize: 7,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Section header ──
class _SectionHeader extends StatelessWidget {
  final String title;
  final String? action;
  final bool dark;

  const _SectionHeader({required this.title, this.action, required this.dark});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title.toUpperCase(),
          style: AppTypography.bodySm.copyWith(
            fontWeight: FontWeight.w600,
            color: dark ? AppColors.darkText4 : AppColors.lightText4,
            letterSpacing: 0.8,
          ),
        ),
        const Spacer(),
        if (action != null)
          Text(
            action!,
            style: AppTypography.caption.copyWith(
              color: dark ? AppColors.accentLight : AppColors.accentDeep,
            ),
          ),
      ],
    );
  }
}
