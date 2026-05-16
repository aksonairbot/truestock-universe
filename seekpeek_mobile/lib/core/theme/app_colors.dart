import 'package:flutter/material.dart';

/// SeekPeek color system — mirrors the web CSS variables.
/// Both dark (default) and light palettes defined here.
class AppColors {
  AppColors._();

  // ── Brand / Accent ──
  static const accent = Color(0xFF7B5CFF);
  static const accentDeep = Color(0xFF5B3DE8);
  static const accentLight = Color(0xFFA78BFA);
  static const accentGlow = Color(0x337B5CFF);
  static const accentWash = Color(0x1A7B5CFF);

  // ── Semantic ──
  static const success = Color(0xFF4ADE80);
  static const successDark = Color(0xFF15803D);
  static const warning = Color(0xFFF5B84A);
  static const warningDark = Color(0xFFB45309);
  static const danger = Color(0xFFEF4444);
  static const dangerDark = Color(0xFFB91C1C);
  static const info = Color(0xFF60A5FA);
  static const infoDark = Color(0xFF1D4ED8);

  // ── Chart / Product palette ──
  static const chart1 = Color(0xFF7B5CFF);
  static const chart2 = Color(0xFF22D3EE);
  static const chart3 = Color(0xFFF5B84A);
  static const chart4 = Color(0xFF4ADE80);
  static const chart5 = Color(0xFFF472B6);

  // ── Priority colors (dark mode) ──
  static const prioLow = Color(0xFF8B8FA3);
  static const prioMed = Color(0xFF60A5FA);
  static const prioHigh = Color(0xFFF5B84A);
  static const prioUrgent = Color(0xFFEF4444);

  // ── Priority colors (light mode) ──
  static const prioMedLight = Color(0xFF1D4ED8);
  static const prioHighLight = Color(0xFFB45309);
  static const prioUrgentLight = Color(0xFFB91C1C);

  // ─────────────────────────────────────────────
  // DARK THEME
  // ─────────────────────────────────────────────
  static const darkBg = Color(0xFF08090E);
  static const darkBg2 = Color(0xFF0F1118);
  static const darkBg3 = Color(0xFF141720);
  static const darkPanel = Color(0xFF0F1118);
  static const darkPanel2 = Color(0xFF141720);
  static const darkBorder = Color(0x0FFFFFFF); // 6%
  static const darkBorder2 = Color(0x14FFFFFF); // 8%
  static const darkText = Color(0xFFFFFFFF);
  static const darkText2 = Color(0xFFC8CAD4);
  static const darkText3 = Color(0xFF8B8FA3);
  static const darkText4 = Color(0xFF6B7094);
  static const darkTextMuted = Color(0xFF4A4E66);

  // ─────────────────────────────────────────────
  // LIGHT THEME
  // ─────────────────────────────────────────────
  static const lightBg = Color(0xFFF5F6F8);
  static const lightBg2 = Color(0xFFECEDF1);
  static const lightBg3 = Color(0xFFE3E4EA);
  static const lightPanel = Color(0xFFFFFFFF);
  static const lightPanel2 = Color(0xFFF8F9FA);
  static const lightBorder = Color(0x0F000000); // 6%
  static const lightBorder2 = Color(0x14000000); // 8%
  static const lightText = Color(0xFF0F1218);
  static const lightText2 = Color(0xFF2D3142);
  static const lightText3 = Color(0xFF525770);
  static const lightText4 = Color(0xFF7B8094);
  static const lightTextMuted = Color(0xFF9CA0B4);

  // ── Avatar gradient pairs ──
  static const avatarGradients = [
    [Color(0xFF7B5CFF), Color(0xFFA78BFA)],
    [Color(0xFFF472B6), Color(0xFFA78BFA)],
    [Color(0xFF22D3EE), Color(0xFF7B5CFF)],
    [Color(0xFFF5B84A), Color(0xFF22D3EE)],
    [Color(0xFF4ADE80), Color(0xFF22D3EE)],
  ];

  /// Pick a deterministic gradient for a name.
  static List<Color> avatarGradient(String? name) {
    if (name == null || name.isEmpty) return avatarGradients[0];
    final sum = name.codeUnits.fold<int>(0, (s, c) => s + c);
    return avatarGradients[sum % avatarGradients.length];
  }
}
