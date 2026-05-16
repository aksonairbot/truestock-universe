import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/theme_provider.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return SafeArea(
      bottom: false,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
        children: [
          // Profile card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: dark ? AppColors.darkPanel : AppColors.lightPanel,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: dark
                    ? Colors.white.withValues(alpha: 0.05)
                    : Colors.black.withValues(alpha: 0.06),
              ),
            ),
            child: Column(
              children: [
                // Avatar
                Container(
                  width: 72,
                  height: 72,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppColors.accent, AppColors.accentLight],
                    ),
                  ),
                  alignment: Alignment.center,
                  child: const Text(
                    'A',
                    style: TextStyle(
                      fontFamily: 'Poppins',
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Amit Kumar',
                  style: AppTypography.heading.copyWith(
                    color: dark ? Colors.white : AppColors.lightText,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'aks@truestock.in',
                  style: AppTypography.bodySm.copyWith(
                    color: dark ? AppColors.darkText4 : AppColors.lightText4,
                  ),
                ),
                const SizedBox(height: 16),

                // Stats row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _ProfileStat(
                        value: '142', label: 'Completed', dark: dark),
                    Container(
                      width: 1,
                      height: 32,
                      color: dark
                          ? Colors.white.withValues(alpha: 0.06)
                          : Colors.black.withValues(alpha: 0.06),
                    ),
                    _ProfileStat(
                        value: '5d', label: 'Streak', dark: dark),
                    Container(
                      width: 1,
                      height: 32,
                      color: dark
                          ? Colors.white.withValues(alpha: 0.06)
                          : Colors.black.withValues(alpha: 0.06),
                    ),
                    _ProfileStat(
                        value: '3', label: 'Projects', dark: dark),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Settings sections
          _SettingsGroup(
            dark: dark,
            children: [
              _SettingsTile(
                icon: Icons.palette_outlined,
                label: 'Appearance',
                trailing: Text(
                  dark ? 'Dark' : 'Light',
                  style: AppTypography.bodySm.copyWith(
                    color:
                        dark ? AppColors.darkText4 : AppColors.lightText4,
                  ),
                ),
                dark: dark,
              ),
              _SettingsTile(
                icon: Icons.notifications_outlined,
                label: 'Notifications',
                dark: dark,
              ),
              _SettingsTile(
                icon: Icons.language_rounded,
                label: 'Language',
                trailing: Text(
                  'English',
                  style: AppTypography.bodySm.copyWith(
                    color:
                        dark ? AppColors.darkText4 : AppColors.lightText4,
                  ),
                ),
                dark: dark,
              ),
            ],
          ),
          const SizedBox(height: 12),

          _SettingsGroup(
            dark: dark,
            children: [
              _SettingsTile(
                icon: Icons.people_outline_rounded,
                label: 'Team members',
                dark: dark,
              ),
              _SettingsTile(
                icon: Icons.workspace_premium_outlined,
                label: 'Subscription',
                trailing: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppColors.accent, AppColors.accentLight],
                    ),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    'Pro',
                    style: AppTypography.micro.copyWith(
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
                dark: dark,
              ),
              _SettingsTile(
                icon: Icons.storage_rounded,
                label: 'Data & storage',
                dark: dark,
              ),
            ],
          ),
          const SizedBox(height: 12),

          _SettingsGroup(
            dark: dark,
            children: [
              _SettingsTile(
                icon: Icons.help_outline_rounded,
                label: 'Help & support',
                dark: dark,
              ),
              _SettingsTile(
                icon: Icons.info_outline_rounded,
                label: 'About SeekPeek',
                trailing: Text(
                  'v2.0.0',
                  style: AppTypography.bodySm.copyWith(
                    color:
                        dark ? AppColors.darkText4 : AppColors.lightText4,
                  ),
                ),
                dark: dark,
              ),
            ],
          ),
          const SizedBox(height: 12),

          _SettingsGroup(
            dark: dark,
            children: [
              _SettingsTile(
                icon: Icons.logout_rounded,
                label: 'Sign out',
                iconColor: dark ? AppColors.danger : AppColors.dangerDark,
                labelColor: dark ? AppColors.danger : AppColors.dangerDark,
                showChevron: false,
                dark: dark,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ProfileStat extends StatelessWidget {
  final String value;
  final String label;
  final bool dark;
  const _ProfileStat({
    required this.value,
    required this.label,
    required this.dark,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: AppTypography.heading.copyWith(
            color: dark ? Colors.white : AppColors.lightText,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: AppTypography.micro.copyWith(
            color: dark ? AppColors.darkText4 : AppColors.lightText4,
          ),
        ),
      ],
    );
  }
}

class _SettingsGroup extends StatelessWidget {
  final bool dark;
  final List<Widget> children;
  const _SettingsGroup({required this.dark, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: dark ? AppColors.darkPanel : AppColors.lightPanel,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: dark
              ? Colors.white.withValues(alpha: 0.05)
              : Colors.black.withValues(alpha: 0.06),
        ),
      ),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            children[i],
            if (i < children.length - 1)
              Divider(
                height: 1,
                indent: 52,
                endIndent: 14,
                color: dark
                    ? Colors.white.withValues(alpha: 0.05)
                    : Colors.black.withValues(alpha: 0.05),
              ),
          ],
        ],
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Widget? trailing;
  final Color? iconColor;
  final Color? labelColor;
  final bool showChevron;
  final bool dark;

  const _SettingsTile({
    required this.icon,
    required this.label,
    this.trailing,
    this.iconColor,
    this.labelColor,
    this.showChevron = true,
    required this.dark,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: (iconColor ?? (dark ? AppColors.accent : AppColors.accentDeep))
                  .withValues(alpha: dark ? 0.08 : 0.06),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              icon,
              size: 18,
              color: iconColor ??
                  (dark ? AppColors.darkText3 : AppColors.lightText3),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: AppTypography.bodySm.copyWith(
                fontWeight: FontWeight.w500,
                color: labelColor ??
                    (dark ? Colors.white : AppColors.lightText),
              ),
            ),
          ),
          if (trailing != null) ...[
            trailing!,
            const SizedBox(width: 6),
          ],
          if (showChevron)
            Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: dark ? AppColors.darkText4 : AppColors.lightText4,
            ),
        ],
      ),
    );
  }
}
