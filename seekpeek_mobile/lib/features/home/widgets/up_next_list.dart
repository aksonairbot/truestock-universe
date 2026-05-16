import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/theme_provider.dart';
import '../../../shared/widgets/priority_badge.dart';

class UpNextList extends StatelessWidget {
  const UpNextList({super.key});

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
          _UpNextTile(
            title: 'Review PR #142 – auth refactor',
            project: 'SeekPeek v2',
            dueLabel: 'Due today',
            priority: Priority.high,
            dark: dark,
            showDivider: true,
          ),
          _UpNextTile(
            title: 'Write API docs for /tasks endpoint',
            project: 'Platform',
            dueLabel: 'Due today',
            priority: Priority.medium,
            dark: dark,
            showDivider: true,
          ),
          _UpNextTile(
            title: 'Design email templates',
            project: 'Marketing',
            dueLabel: 'Tomorrow',
            priority: Priority.low,
            dark: dark,
            showDivider: false,
          ),
        ],
      ),
    );
  }
}

class _UpNextTile extends StatelessWidget {
  final String title;
  final String project;
  final String dueLabel;
  final Priority priority;
  final bool dark;
  final bool showDivider;

  const _UpNextTile({
    required this.title,
    required this.project,
    required this.dueLabel,
    required this.priority,
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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Checkbox circle
              Container(
                width: 20,
                height: 20,
                margin: const EdgeInsets.only(top: 2),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: dark
                        ? Colors.white.withValues(alpha: 0.15)
                        : Colors.black.withValues(alpha: 0.15),
                    width: 1.5,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              // Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AppTypography.bodySm.copyWith(
                        fontWeight: FontWeight.w500,
                        color: dark ? Colors.white : AppColors.lightText,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: dark
                                ? Colors.white.withValues(alpha: 0.05)
                                : Colors.black.withValues(alpha: 0.04),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            project,
                            style: AppTypography.micro.copyWith(
                              color: dark
                                  ? AppColors.darkText4
                                  : AppColors.lightText4,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(
                          Icons.schedule_rounded,
                          size: 12,
                          color: dark
                              ? AppColors.darkText4
                              : AppColors.lightText4,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          dueLabel,
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
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: PriorityBadge(priority: priority),
              ),
            ],
          ),
        ),
        if (showDivider)
          Divider(
            height: 1,
            indent: 44,
            endIndent: 14,
            color: dark
                ? Colors.white.withValues(alpha: 0.05)
                : Colors.black.withValues(alpha: 0.06),
          ),
      ],
    );
  }
}
