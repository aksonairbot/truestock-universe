import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/theme_provider.dart';

class QuickCaptureSheet extends StatelessWidget {
  const QuickCaptureSheet({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return Container(
      decoration: BoxDecoration(
        color: dark ? AppColors.darkPanel : AppColors.lightPanel,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(
          top: BorderSide(
            color: dark
                ? Colors.white.withValues(alpha: 0.06)
                : Colors.black.withValues(alpha: 0.06),
          ),
        ),
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            20, 12, 20, MediaQuery.of(context).viewInsets.bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Handle
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: dark
                      ? Colors.white.withValues(alpha: 0.12)
                      : Colors.black.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Title
            Text(
              'Quick capture',
              style: AppTypography.heading.copyWith(
                color: dark ? Colors.white : AppColors.lightText,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Create a task, note, or reminder in seconds.',
              style: AppTypography.bodySm.copyWith(
                color: dark ? AppColors.darkText4 : AppColors.lightText4,
              ),
            ),
            const SizedBox(height: 20),

            // Task title input
            Container(
              decoration: BoxDecoration(
                color: dark
                    ? Colors.white.withValues(alpha: 0.04)
                    : Colors.black.withValues(alpha: 0.03),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: dark
                      ? Colors.white.withValues(alpha: 0.06)
                      : Colors.black.withValues(alpha: 0.08),
                ),
              ),
              child: TextField(
                autofocus: true,
                style: AppTypography.body.copyWith(
                  color: dark ? Colors.white : AppColors.lightText,
                ),
                decoration: InputDecoration(
                  hintText: 'What needs to be done?',
                  hintStyle: AppTypography.body.copyWith(
                    color:
                        dark ? AppColors.darkText4 : AppColors.lightText4,
                  ),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 12),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Quick options row
            Row(
              children: [
                _QuickOption(
                  icon: Icons.calendar_today_rounded,
                  label: 'Today',
                  dark: dark,
                ),
                const SizedBox(width: 8),
                _QuickOption(
                  icon: Icons.flag_rounded,
                  label: 'Priority',
                  dark: dark,
                ),
                const SizedBox(width: 8),
                _QuickOption(
                  icon: Icons.folder_outlined,
                  label: 'Project',
                  dark: dark,
                ),
                const SizedBox(width: 8),
                _QuickOption(
                  icon: Icons.person_outline_rounded,
                  label: 'Assign',
                  dark: dark,
                ),
              ],
            ),
            const SizedBox(height: 20),

            // AI suggestion area
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: dark
                      ? [
                          AppColors.accent.withValues(alpha: 0.06),
                          AppColors.chart2.withValues(alpha: 0.04),
                        ]
                      : [
                          AppColors.accentDeep.withValues(alpha: 0.04),
                          const Color(0xFF0891B2).withValues(alpha: 0.03),
                        ],
                ),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: (dark ? AppColors.accent : AppColors.accentDeep)
                      .withValues(alpha: 0.1),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.auto_awesome_rounded,
                    size: 16,
                    color: dark ? AppColors.accent : AppColors.accentDeep,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'AI will suggest priority, project & due date',
                      style: AppTypography.micro.copyWith(
                        color: dark
                            ? AppColors.accentLight
                            : AppColors.accentDeep,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Create button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppColors.accent, AppColors.accentLight],
                  ),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.accent.withValues(alpha: 0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => Navigator.of(context).pop(),
                    child: Center(
                      child: Text(
                        'Create task',
                        style: AppTypography.body.copyWith(
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickOption extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool dark;
  const _QuickOption({
    required this.icon,
    required this.label,
    required this.dark,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: dark
              ? Colors.white.withValues(alpha: 0.04)
              : Colors.black.withValues(alpha: 0.03),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: dark
                ? Colors.white.withValues(alpha: 0.06)
                : Colors.black.withValues(alpha: 0.06),
          ),
        ),
        child: Column(
          children: [
            Icon(
              icon,
              size: 18,
              color: dark ? AppColors.darkText3 : AppColors.lightText3,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: AppTypography.micro.copyWith(
                color: dark ? AppColors.darkText4 : AppColors.lightText4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
