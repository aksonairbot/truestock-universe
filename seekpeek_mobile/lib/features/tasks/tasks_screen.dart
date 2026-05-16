import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/theme_provider.dart';
import '../../shared/widgets/avatar.dart';
import '../../shared/widgets/priority_badge.dart';

class TasksScreen extends StatelessWidget {
  const TasksScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return SafeArea(
      bottom: false,
      child: CustomScrollView(
        slivers: [
          // Header
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            sliver: SliverToBoxAdapter(
              child: Row(
                children: [
                  Text(
                    'Tasks',
                    style: AppTypography.title.copyWith(
                      color: dark ? Colors.white : AppColors.lightText,
                    ),
                  ),
                  const Spacer(),
                  _FilterChip(label: 'All', selected: true, dark: dark),
                  const SizedBox(width: 6),
                  _FilterChip(label: 'Mine', selected: false, dark: dark),
                  const SizedBox(width: 6),
                  _FilterChip(label: 'Overdue', selected: false, dark: dark),
                ],
              ),
            ),
          ),

          // Search bar
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            sliver: SliverToBoxAdapter(
              child: Container(
                height: 42,
                decoration: BoxDecoration(
                  color: dark ? AppColors.darkPanel : AppColors.lightPanel,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: dark
                        ? Colors.white.withValues(alpha: 0.06)
                        : Colors.black.withValues(alpha: 0.08),
                  ),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: Row(
                  children: [
                    Icon(
                      Icons.search_rounded,
                      size: 18,
                      color:
                          dark ? AppColors.darkText4 : AppColors.lightText4,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Search tasks…',
                        style: AppTypography.bodySm.copyWith(
                          color: dark
                              ? AppColors.darkText4
                              : AppColors.lightText4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Section: Today
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            sliver: SliverToBoxAdapter(
              child: Text(
                'TODAY',
                style: AppTypography.micro.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.8,
                  color: dark ? AppColors.darkText4 : AppColors.lightText4,
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _TaskCard(
                  title: 'Review PR #142 – auth refactor',
                  project: 'SeekPeek v2',
                  assignee: 'Amit',
                  priority: Priority.high,
                  dueLabel: 'Today',
                  dark: dark,
                ),
                const SizedBox(height: 8),
                _TaskCard(
                  title: 'Write API docs for /tasks endpoint',
                  project: 'Platform',
                  assignee: 'Amit',
                  priority: Priority.medium,
                  dueLabel: 'Today',
                  dark: dark,
                ),
                const SizedBox(height: 8),
                _TaskCard(
                  title: 'Fix mobile nav z-index bug',
                  project: 'SeekPeek v2',
                  assignee: 'Priya',
                  priority: Priority.urgent,
                  dueLabel: 'Today',
                  dark: dark,
                  isOverdue: true,
                ),
              ]),
            ),
          ),

          // Section: This week
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
            sliver: SliverToBoxAdapter(
              child: Text(
                'THIS WEEK',
                style: AppTypography.micro.copyWith(
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.8,
                  color: dark ? AppColors.darkText4 : AppColors.lightText4,
                ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                _TaskCard(
                  title: 'Design email templates',
                  project: 'Marketing',
                  assignee: 'Amit',
                  priority: Priority.low,
                  dueLabel: 'Tomorrow',
                  dark: dark,
                ),
                const SizedBox(height: 8),
                _TaskCard(
                  title: 'Set up CI/CD pipeline for staging',
                  project: 'Platform',
                  assignee: 'Vikram',
                  priority: Priority.medium,
                  dueLabel: 'Wed',
                  dark: dark,
                ),
                const SizedBox(height: 8),
                _TaskCard(
                  title: 'User research interviews (batch 2)',
                  project: 'SeekPeek v2',
                  assignee: 'Sneha',
                  priority: Priority.high,
                  dueLabel: 'Thu',
                  dark: dark,
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final bool dark;
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.dark,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: selected
            ? (dark ? AppColors.accent : AppColors.accentDeep)
                .withValues(alpha: dark ? 0.15 : 0.1)
            : dark
                ? Colors.white.withValues(alpha: 0.04)
                : Colors.black.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(8),
        border: selected
            ? Border.all(
                color: (dark ? AppColors.accent : AppColors.accentDeep)
                    .withValues(alpha: 0.3),
              )
            : null,
      ),
      child: Text(
        label,
        style: AppTypography.micro.copyWith(
          fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          color: selected
              ? (dark ? AppColors.accent : AppColors.accentDeep)
              : (dark ? AppColors.darkText4 : AppColors.lightText4),
        ),
      ),
    );
  }
}

class _TaskCard extends StatelessWidget {
  final String title;
  final String project;
  final String assignee;
  final Priority priority;
  final String dueLabel;
  final bool dark;
  final bool isOverdue;

  const _TaskCard({
    required this.title,
    required this.project,
    required this.assignee,
    required this.priority,
    required this.dueLabel,
    required this.dark,
    this.isOverdue = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: dark ? AppColors.darkPanel : AppColors.lightPanel,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isOverdue
              ? (dark ? AppColors.danger : AppColors.dangerDark)
                  .withValues(alpha: 0.25)
              : dark
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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Checkbox
              Container(
                width: 20,
                height: 20,
                margin: const EdgeInsets.only(top: 1),
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
              Expanded(
                child: Text(
                  title,
                  style: AppTypography.bodySm.copyWith(
                    fontWeight: FontWeight.w500,
                    color: dark ? Colors.white : AppColors.lightText,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              PriorityBadge(priority: priority),
            ],
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.only(left: 30),
            child: Row(
              children: [
                // Project tag
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: dark
                        ? Colors.white.withValues(alpha: 0.05)
                        : Colors.black.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    project,
                    style: AppTypography.micro.copyWith(
                      color:
                          dark ? AppColors.darkText4 : AppColors.lightText4,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // Due
                Icon(
                  Icons.schedule_rounded,
                  size: 12,
                  color: isOverdue
                      ? (dark ? AppColors.danger : AppColors.dangerDark)
                      : (dark ? AppColors.darkText4 : AppColors.lightText4),
                ),
                const SizedBox(width: 3),
                Text(
                  dueLabel,
                  style: AppTypography.micro.copyWith(
                    color: isOverdue
                        ? (dark ? AppColors.danger : AppColors.dangerDark)
                        : (dark
                            ? AppColors.darkText4
                            : AppColors.lightText4),
                  ),
                ),
                const Spacer(),
                Avatar(name: assignee, size: 20, fontSize: 8),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
