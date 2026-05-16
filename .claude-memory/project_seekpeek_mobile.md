---
name: SeekPeek Mobile Flutter project
description: Complete Flutter mobile app project — structure, screens, theme, setup instructions, and how to run it
type: project
originSessionId: 4420fffe-e1eb-4573-99af-11aa03fb9674
---
## SeekPeek Mobile App (Flutter)

**Location:** `~/Documents/Claude/Projects/Superman/seekpeek_mobile/`

### Project Status (May 16, 2026)
All screens fully built — ready to run once Flutter SDK is installed on Mac Mini.

### Tech Stack
- Flutter 3.x with Riverpod (state), GoRouter (navigation)
- Poppins font family (matches web app)
- Dark + Light theme system mirroring web CSS variables
- `withValues(alpha:)` pattern throughout (no deprecated `withOpacity`)

### File Structure (19 Dart files)
```
lib/
  main.dart                              — Entry point, ProviderScope + MaterialApp.router
  core/
    router/app_router.dart               — GoRouter with ShellRoute, 4 tab routes
    theme/
      app_colors.dart                    — Full color system (brand, semantic, chart, priority, dark/light)
      app_typography.dart                — Type scale: displayLg→micro + heroNumber(42px)
      app_theme.dart                     — ThemeData factories (dark + light)
      theme_provider.dart                — Riverpod ThemeModeNotifier + isDark extension
  shared/widgets/
    app_shell.dart                       — Bottom nav bar + gradient FAB + QuickCapture trigger
    avatar.dart                          — Deterministic gradient avatar from name hash
    priority_badge.dart                  — Priority enum (low/medium/high/urgent) with dark/light colors
  features/
    home/
      home_screen.dart                   — CustomScrollView: header, banner, stats, projects, activity, up-next
      widgets/
        hero_banner.dart                 — Aurora gradient banner, big "7 of 10" typography, CustomPaint
        stat_card_row.dart               — Overdue/Due today/Streak stat cards
        project_carousel.dart            — Horizontal project cards with gradient banners + stacked avatars
        team_activity.dart               — Activity feed (completed/commented/started)
        up_next_list.dart                — Task list with checkbox circles + priority badges
    tasks/tasks_screen.dart              — Filter chips, search, task cards grouped Today/This Week
    capture/quick_capture_sheet.dart      — Bottom sheet: text input, quick options, AI suggestion, create button
    chat/chat_screen.dart                — Channel list with group icons, DM avatars, unread badges
    profile/profile_screen.dart          — Avatar card + stats, settings groups, sign out
```

### Setup Script
A setup script exists at `seekpeek_mobile/setup_flutter.sh`. Run:
```bash
bash ~/Documents/Claude/Projects/Superman/seekpeek_mobile/setup_flutter.sh
```
It installs: Homebrew → Flutter SDK → Xcode CLI tools → CocoaPods → runs `flutter pub get`

### Run Commands
```bash
cd ~/Documents/Claude/Projects/Superman/seekpeek_mobile
flutter run -d chrome     # Web
flutter run -d macos      # macOS desktop app
open -a Simulator && flutter run   # iOS Simulator
```

### Key Dependencies (pubspec.yaml)
go_router ^14.2.0, flutter_riverpod ^2.5.1, google_fonts ^6.2.1, flutter_svg ^2.0.10, flutter_animate ^4.5.0, percent_indicator ^4.2.3, shimmer ^3.0.0, cached_network_image ^3.3.1

### Design Spec
Word document at `~/Documents/Claude/Projects/Superman/SeekPeek-Mobile-Design-Spec.docx` — 11-section spec covering all screens, theme, navigation, and components.

### Fonts
Poppins 400/500/600/700 declared in pubspec.yaml under `assets/fonts/`. Font files need to be placed there, or switch to `google_fonts` package runtime loading.

**Why:** Building mobile companion for SeekPeek web app (task management + AI). Approved mockups in both dark and light modes.

**How to apply:** When user asks about the mobile app, reference this structure. The app mirrors the web app's visual language.
