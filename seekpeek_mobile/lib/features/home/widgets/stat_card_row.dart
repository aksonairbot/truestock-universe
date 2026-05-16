import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/theme_provider.dart';

class StatCardRow extends StatelessWidget {
  const StatCardRow({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return Row(
      children: [
        Expanded(
          child: _StatCard(
            icon: Icons.error_outline_rounded,
            iconBg: (dark ? AppColors.danger : AppColors.dangerDark)
                .withValues(alpha: dark ? 0.1 : 0.07),
            iconColor: dark ? AppColors.danger : AppColors.dangerDark,
            label: 'Overdue',
            value: '1',
            valueColor: dark ? AppColors.danger : AppColors.dangerDark,
            dark: dark,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatCard(
            icon: Icons.schedule_rounded,
            iconBg: (dark ? AppColors.warning : AppColors.warningDark)
                .withValues(alpha: dark ? 0.1 : 0.07),
            iconColor: dark ? AppColors.warning : AppColors.warningDark,
            label: 'Due today',
            value: '3',
            valueColor: dark ? AppColors.warning : AppColors.warningDark,
            dark: dark,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatCard(
            icon: Icons.show_chart_rounded,
            iconBg: (dark ? AppColors.accent : AppColors.accentDeep)
                .withValues(alpha: dark ? 0.1 : 0.07),
            iconColor: dark ? AppColors.accent : AppColors.accentDeep,
            label: 'Streak',
            value: '5d',
            valueColor: dark ? AppColors.accent : AppColors.accentDeep,
            dark: dark,
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final Color iconBg;
  final Color iconColor;
  final String label;
  final String value;
  final Color valueColor;
  final bool dark;

  const _StatCard({
    required this.icon,
    required this.iconBg,
    required this.iconColor,
    required this.label,
    required this.value,
    required this.valueColor,
    required this.dark,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: dark ? AppColors.darkPanel : AppColors.lightPanel,
        borderRadius: BorderRadius.circular(14),
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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 14, color: iconColor),
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  style: AppTypography.micro.copyWith(
                    color:
                        dark ? AppColors.darkText4 : AppColors.lightText4,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: AppTypography.title.copyWith(color: valueColor),
          ),
        ],
      ),
    );
  }
}
