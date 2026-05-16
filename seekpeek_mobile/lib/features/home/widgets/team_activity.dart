import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../shared/widgets/avatar.dart';

class TeamActivity extends StatelessWidget {
  const TeamActivity({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return Container(
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
      child: Column(
        children: [
          _ActivityTile(
            name: 'Priya',
            action: 'completed',
            target: 'API auth middleware',
            time: '12m ago',
            icon: Icons.check_circle_rounded,
            iconColor: dark ? AppColors.success : AppColors.successDark,
            dark: dark,
            showDivider: true,
          ),
          _ActivityTile(
            name: 'Rahul',
            action: 'commented on',
            target: 'Dashboard redesign',
            time: '34m ago',
            icon: Icons.chat_bubble_rounded,
            iconColor: dark ? AppColors.accent : AppColors.accentDeep,
            dark: dark,
            showDivider: true,
          ),
          _ActivityTile(
            name: 'Sneha',
            action: 'started',
            target: 'User onboarding flow',
            time: '1h ago',
            icon: Icons.play_circle_rounded,
            iconColor: dark ? AppColors.warning : AppColors.warningDark,
            dark: dark,
            showDivider: false,
          ),
        ],
      ),
    );
  }
}

class _ActivityTile extends StatelessWidget {
  final String name;
  final String action;
  final String target;
  final String time;
  final IconData icon;
  final Color iconColor;
  final bool dark;
  final bool showDivider;

  const _ActivityTile({
    required this.name,
    required this.action,
    required this.target,
    required this.time,
    required this.icon,
    required this.iconColor,
    required this.dark,
    required this.showDivider,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Avatar(name: name, size: 32, fontSize: 12),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(
                        children: [
                          TextSpan(
                            text: name,
                            style: AppTypography.bodySm.copyWith(
                              fontWeight: FontWeight.w600,
                              color: dark ? Colors.white : AppColors.lightText,
                            ),
                          ),
                          TextSpan(
                            text: ' $action ',
                            style: AppTypography.bodySm.copyWith(
                              color: dark
                                  ? AppColors.darkText4
                                  : AppColors.lightText4,
                            ),
                          ),
                          TextSpan(
                            text: target,
                            style: AppTypography.bodySm.copyWith(
                              fontWeight: FontWeight.w500,
                              color: dark
                                  ? AppColors.darkText2
                                  : AppColors.lightText2,
                            ),
                          ),
                        ],
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      time,
                      style: AppTypography.micro.copyWith(
                        color: dark
                            ? AppColors.darkText4
                            : AppColors.lightText4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(icon, size: 18, color: iconColor),
            ],
          ),
        ),
        if (showDivider)
          Divider(
            height: 1,
            indent: 56,
            endIndent: 14,
            color: dark
                ? Colors.white.withValues(alpha: 0.05)
                : Colors.black.withValues(alpha: 0.06),
          ),
      ],
    );
  }
}
