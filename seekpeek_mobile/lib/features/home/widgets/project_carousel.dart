import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../shared/widgets/avatar.dart';

class ProjectCarousel extends StatelessWidget {
  const ProjectCarousel({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return SizedBox(
      height: 142,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _ProjectCard(
            name: 'SeekPeek v2',
            progress: 0.65,
            members: ['Amit', 'Priya', 'Rahul'],
            gradientColors: dark
                ? const [Color(0xFF1A0A4A), Color(0xFF0A1E52)]
                : const [Color(0xFFE8E0FF), Color(0xFFD5ECFF)],
            progressColors: dark
                ? const [AppColors.accent, AppColors.chart2]
                : const [AppColors.accentDeep, Color(0xFF0891B2)],
            glowColor: AppColors.accent,
            dark: dark,
          ),
          const SizedBox(width: 10),
          _ProjectCard(
            name: 'Platform',
            progress: 0.4,
            members: ['Sneha', 'Vikram'],
            gradientColors: dark
                ? const [Color(0xFF2A1505), Color(0xFF0A1E52)]
                : const [Color(0xFFFEF3C7), Color(0xFFFFE4E6)],
            progressColors: dark
                ? const [AppColors.warning, AppColors.danger]
                : [AppColors.warningDark, AppColors.dangerDark],
            glowColor: AppColors.warning,
            dark: dark,
          ),
          const SizedBox(width: 10),
          _ProjectCard(
            name: 'Marketing',
            progress: 0.85,
            members: ['Amit'],
            gradientColors: dark
                ? const [Color(0xFF05201A), Color(0xFF0A1E52)]
                : const [Color(0xFFDCFCE7), Color(0xFFD5F0FF)],
            progressColors: dark
                ? const [AppColors.success, AppColors.chart2]
                : [AppColors.successDark, const Color(0xFF0891B2)],
            glowColor: AppColors.success,
            dark: dark,
          ),
        ],
      ),
    );
  }
}

class _ProjectCard extends StatelessWidget {
  final String name;
  final double progress;
  final List<String> members;
  final List<Color> gradientColors;
  final List<Color> progressColors;
  final Color glowColor;
  final bool dark;

  const _ProjectCard({
    required this.name,
    required this.progress,
    required this.members,
    required this.gradientColors,
    required this.progressColors,
    required this.glowColor,
    required this.dark,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 155,
      decoration: BoxDecoration(
        color: dark ? AppColors.darkPanel : AppColors.lightPanel,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: dark
              ? Colors.white.withValues(alpha: 0.05)
              : Colors.black.withValues(alpha: 0.06),
        ),
        boxShadow: dark
            ? null
            : [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.04),
                  blurRadius: 4,
                  offset: const Offset(0, 1),
                )
              ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          // Banner
          Container(
            height: 68,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: gradientColors,
              ),
            ),
            child: Stack(
              children: [
                // Glow orb
                Positioned(
                  top: -8,
                  right: -8,
                  child: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          glowColor.withValues(alpha: dark ? 0.25 : 0.12),
                          Colors.transparent,
                        ],
                      ),
                    ),
                  ),
                ),
                // Stacked avatars
                Positioned(
                  bottom: 8,
                  left: 10,
                  child: _StackedAvatars(members: members, dark: dark),
                ),
              ],
            ),
          ),
          // Info
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: AppTypography.bodySm.copyWith(
                    fontWeight: FontWeight.w600,
                    color: dark ? Colors.white : AppColors.lightText,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        height: 4,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(2),
                          color: dark
                              ? Colors.white.withValues(alpha: 0.06)
                              : Colors.black.withValues(alpha: 0.06),
                        ),
                        child: FractionallySizedBox(
                          alignment: Alignment.centerLeft,
                          widthFactor: progress,
                          child: Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(2),
                              gradient: LinearGradient(colors: progressColors),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '${(progress * 100).round()}%',
                      style: AppTypography.micro.copyWith(
                        color: dark
                            ? AppColors.darkText4
                            : AppColors.lightText4,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StackedAvatars extends StatelessWidget {
  final List<String> members;
  final bool dark;
  const _StackedAvatars({required this.members, required this.dark});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 22,
      width: 22.0 + (members.length - 1) * 16,
      child: Stack(
        children: [
          for (var i = 0; i < members.length; i++)
            Positioned(
              left: i * 16.0,
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: dark ? AppColors.darkPanel : Colors.white,
                    width: 2,
                  ),
                ),
                child: Avatar(name: members[i], size: 18, fontSize: 7),
              ),
            ),
        ],
      ),
    );
  }
}
