import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app_colors.dart';

/// Theme mode notifier — persists across the app session.
class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier() : super(ThemeMode.dark);

  void toggle() {
    state = state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
  }

  void setDark() => state = ThemeMode.dark;
  void setLight() => state = ThemeMode.light;

  bool get isDark => state == ThemeMode.dark;
}

final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier();
});

/// Convenience extension to resolve semantic colors from context.
extension SeekPeekColors on BuildContext {
  bool get isDark => Theme.of(this).brightness == Brightness.dark;

  Color get bg => isDark ? AppColors.darkBg : AppColors.lightBg;
  Color get bg2 => isDark ? AppColors.darkBg2 : AppColors.lightBg2;
  Color get bg3 => isDark ? AppColors.darkBg3 : AppColors.lightBg3;
  Color get panel => isDark ? AppColors.darkPanel : AppColors.lightPanel;
  Color get panel2 => isDark ? AppColors.darkPanel2 : AppColors.lightPanel2;
  Color get border => isDark ? AppColors.darkBorder : AppColors.lightBorder;
  Color get textPrimary => isDark ? AppColors.darkText : AppColors.lightText;
  Color get textSecondary =>
      isDark ? AppColors.darkText2 : AppColors.lightText2;
  Color get textTertiary =>
      isDark ? AppColors.darkText3 : AppColors.lightText3;
  Color get textQuaternary =>
      isDark ? AppColors.darkText4 : AppColors.lightText4;
  Color get textMuted =>
      isDark ? AppColors.darkTextMuted : AppColors.lightTextMuted;

  // Semantic
  Color get success => isDark ? AppColors.success : AppColors.successDark;
  Color get warning => isDark ? AppColors.warning : AppColors.warningDark;
  Color get danger => isDark ? AppColors.danger : AppColors.dangerDark;
  Color get info => isDark ? AppColors.info : AppColors.infoDark;
  Color get accent => isDark ? AppColors.accent : AppColors.accentDeep;
}
