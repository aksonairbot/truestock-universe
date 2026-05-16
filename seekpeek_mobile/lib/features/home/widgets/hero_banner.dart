import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/theme_provider.dart';

/// The aurora-gradient hero banner with big typography, no circle.
class HeroBanner extends StatelessWidget {
  const HeroBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: SizedBox(
        height: 188,
        child: Stack(
          children: [
            // ── Background gradient ──
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: const Alignment(-0.8, -0.6),
                    end: const Alignment(0.8, 0.6),
                    colors: dark
                        ? const [
                            Color(0xFF0D0530),
                            Color(0xFF1A0A4A),
                            Color(0xFF0A1E52),
                            Color(0xFF062A3E),
                            Color(0xFF0B1628),
                          ]
                        : const [
                            Color(0xFF3B1F8E),
                            Color(0xFF5B3DE8),
                            Color(0xFF6E5AEF),
                            Color(0xFF4A6CF7),
                            Color(0xFF2B8CDB),
                            Color(0xFF1DBBC4),
                            Color(0xFF3DCEAD),
                          ],
                  ),
                ),
              ),
            ),

            // ── Aurora radial overlays ──
            Positioned.fill(child: CustomPaint(painter: _AuroraPainter(dark))),

            // ── Star dots ──
            ..._starDots(dark),

            // ── Aurora wave line ──
            Positioned.fill(
              child: CustomPaint(painter: _AuroraWavePainter(dark)),
            ),

            // ── Content ──
            Positioned.fill(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 26),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "TODAY'S PROGRESS",
                      style: TextStyle(
                        fontFamily: 'Poppins',
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 1.2,
                        color: Colors.white.withValues(alpha: dark ? 0.45 : 0.6),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(
                          '7',
                          style: AppTypography.heroNumber
                              .copyWith(color: Colors.white),
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'of 10 tasks',
                          style: TextStyle(
                            fontFamily: 'Poppins',
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                            color: Colors.white
                                .withValues(alpha: dark ? 0.5 : 0.65),
                            letterSpacing: -0.15,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // Progress bar
                    _ProgressBar(dark: dark),
                    const SizedBox(height: 14),

                    // Status dots
                    Row(
                      children: [
                        _StatusDot(
                            color: AppColors.success,
                            label: '7 done',
                            dark: dark),
                        const SizedBox(width: 16),
                        _StatusDot(
                            color: AppColors.warning,
                            label: '2 active',
                            dark: dark),
                        const SizedBox(width: 16),
                        _StatusDot(
                            color: AppColors.danger,
                            label: '1 overdue',
                            dark: dark),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // ── Bottom highlight line ──
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              height: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Colors.transparent,
                      Colors.white.withValues(alpha: 0.1),
                      AppColors.accentLight.withValues(alpha: 0.15),
                      Colors.white.withValues(alpha: 0.1),
                      Colors.transparent,
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _starDots(bool dark) {
    final alpha = dark ? 0.45 : 0.55;
    const positions = [
      [22.0, 28.0],
      [45.0, null, 55.0],
      [70.0, null, null],
      [null, 18.0, null, 50.0],
      [null, null, 30.0, 65.0],
    ];

    return [
      Positioned(top: 22, left: 28, child: _Dot(alpha: 0.5)),
      Positioned(top: 45, right: 55, child: _Dot(alpha: 0.35)),
      Positioned(top: 70, left: 200, child: _Dot(alpha: 0.4)),
      Positioned(bottom: 50, left: 60, child: _Dot(alpha: 0.3)),
      Positioned(bottom: 65, right: 100, child: _Dot(alpha: alpha)),
    ];
  }
}

class _Dot extends StatelessWidget {
  final double alpha;
  const _Dot({this.alpha = 0.4});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 2,
      height: 2,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: alpha),
      ),
    );
  }
}

class _ProgressBar extends StatelessWidget {
  final bool dark;
  const _ProgressBar({required this.dark});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 6,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(3),
        color: Colors.white.withValues(alpha: dark ? 0.08 : 0.15),
      ),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: 0.7,
        child: Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(3),
            gradient: LinearGradient(
              colors: dark
                  ? const [
                      AppColors.accentLight,
                      AppColors.chart2,
                      AppColors.success,
                    ]
                  : [
                      Colors.white.withValues(alpha: 0.7),
                      Colors.white.withValues(alpha: 0.95),
                      Colors.white.withValues(alpha: 0.7),
                    ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  final Color color;
  final String label;
  final bool dark;
  const _StatusDot(
      {required this.color, required this.label, required this.dark});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(shape: BoxShape.circle, color: color),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            fontFamily: 'Poppins',
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: Colors.white.withValues(alpha: dark ? 0.7 : 0.8),
          ),
        ),
      ],
    );
  }
}

// ── Aurora glow painter ──
class _AuroraPainter extends CustomPainter {
  final bool dark;
  _AuroraPainter(this.dark);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;

    // Top-right purple glow
    paint.shader = RadialGradient(
      center: const Alignment(0.5, -0.6),
      radius: 0.8,
      colors: [
        AppColors.accent.withValues(alpha: dark ? 0.35 : 0.2),
        Colors.transparent,
      ],
    ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, paint);

    // Bottom-left cyan glow
    paint.shader = RadialGradient(
      center: const Alignment(-0.6, 0.6),
      radius: 0.7,
      colors: [
        AppColors.chart2.withValues(alpha: dark ? 0.2 : 0.12),
        Colors.transparent,
      ],
    ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

// ── Aurora wave line painter ──
class _AuroraWavePainter extends CustomPainter {
  final bool dark;
  _AuroraWavePainter(this.dark);

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;

    final path = Path()
      ..moveTo(0, h * 0.64)
      ..cubicTo(w * 0.18, h * 0.45, w * 0.35, h * 0.56, w * 0.5, h * 0.5)
      ..cubicTo(w * 0.65, h * 0.44, w * 0.82, h * 0.52, w, h * 0.6);

    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5
      ..shader = LinearGradient(
        colors: dark
            ? [AppColors.chart2, AppColors.accent, AppColors.chart5]
            : [
                Colors.white.withValues(alpha: 0.6),
                Colors.white.withValues(alpha: 0.9),
                Colors.white.withValues(alpha: 0.5),
              ],
      ).createShader(Rect.fromLTWH(0, 0, w, h));

    canvas.save();
    canvas.clipRect(Offset.zero & size);
    canvas.drawPath(path, paint..color = paint.color.withValues(alpha: 0.3));
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
