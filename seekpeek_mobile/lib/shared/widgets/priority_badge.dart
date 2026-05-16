import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/theme_provider.dart';

enum Priority { low, medium, high, urgent }

class PriorityBadge extends StatelessWidget {
  final Priority priority;
  const PriorityBadge({super.key, required this.priority});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    final (label, color) = switch (priority) {
      Priority.low => ('Low', AppColors.prioLow),
      Priority.medium => ('Medium', dark ? AppColors.prioMed : AppColors.prioMedLight),
      Priority.high => ('High', dark ? AppColors.prioHigh : AppColors.prioHighLight),
      Priority.urgent => ('Urgent', dark ? AppColors.prioUrgent : AppColors.prioUrgentLight),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: dark ? 0.12 : 0.08),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontFamily: 'Poppins',
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}
