import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/theme_provider.dart';
import '../../shared/widgets/avatar.dart';

class ChatScreen extends StatelessWidget {
  const ChatScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = context.isDark;
    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            child: Row(
              children: [
                Text(
                  'Chat',
                  style: AppTypography.title.copyWith(
                    color: dark ? Colors.white : AppColors.lightText,
                  ),
                ),
                const Spacer(),
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: dark
                        ? Colors.white.withValues(alpha: 0.05)
                        : Colors.black.withValues(alpha: 0.04),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    Icons.edit_square,
                    size: 18,
                    color:
                        dark ? AppColors.darkText3 : AppColors.lightText3,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Channel list
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                _ChannelTile(
                  name: 'SeekPeek v2',
                  lastMessage: 'Priya: Auth middleware is merged!',
                  time: '2m',
                  unread: 3,
                  isGroup: true,
                  dark: dark,
                ),
                _ChannelTile(
                  name: 'Platform',
                  lastMessage: 'Vikram: CI pipeline config updated',
                  time: '18m',
                  unread: 1,
                  isGroup: true,
                  dark: dark,
                ),
                _ChannelTile(
                  name: 'Priya',
                  lastMessage: 'Can you review the PR today?',
                  time: '34m',
                  unread: 0,
                  isGroup: false,
                  dark: dark,
                ),
                _ChannelTile(
                  name: 'General',
                  lastMessage: 'Sneha: Standup at 10:30 today',
                  time: '1h',
                  unread: 0,
                  isGroup: true,
                  dark: dark,
                ),
                _ChannelTile(
                  name: 'Rahul',
                  lastMessage: 'Dashboard mockups attached',
                  time: '3h',
                  unread: 0,
                  isGroup: false,
                  dark: dark,
                ),
                _ChannelTile(
                  name: 'Marketing',
                  lastMessage: 'Amit: Email templates ready for review',
                  time: '5h',
                  unread: 0,
                  isGroup: true,
                  dark: dark,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChannelTile extends StatelessWidget {
  final String name;
  final String lastMessage;
  final String time;
  final int unread;
  final bool isGroup;
  final bool dark;

  const _ChannelTile({
    required this.name,
    required this.lastMessage,
    required this.time,
    required this.unread,
    required this.isGroup,
    required this.dark,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: unread > 0
            ? (dark ? AppColors.accent : AppColors.accentDeep)
                .withValues(alpha: dark ? 0.04 : 0.02)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          // Avatar or group icon
          if (isGroup)
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: dark
                    ? Colors.white.withValues(alpha: 0.06)
                    : Colors.black.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                Icons.group_rounded,
                size: 20,
                color: dark ? AppColors.darkText3 : AppColors.lightText3,
              ),
            )
          else
            Avatar(name: name, size: 42, fontSize: 16),
          const SizedBox(width: 12),

          // Content
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        isGroup ? '# $name' : name,
                        style: AppTypography.bodySm.copyWith(
                          fontWeight:
                              unread > 0 ? FontWeight.w600 : FontWeight.w500,
                          color: dark ? Colors.white : AppColors.lightText,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      time,
                      style: AppTypography.micro.copyWith(
                        color: unread > 0
                            ? (dark
                                ? AppColors.accent
                                : AppColors.accentDeep)
                            : (dark
                                ? AppColors.darkText4
                                : AppColors.lightText4),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        lastMessage,
                        style: AppTypography.caption.copyWith(
                          color: unread > 0
                              ? (dark
                                  ? AppColors.darkText2
                                  : AppColors.lightText2)
                              : (dark
                                  ? AppColors.darkText4
                                  : AppColors.lightText4),
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (unread > 0) ...[
                      const SizedBox(width: 8),
                      Container(
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [
                              AppColors.accent,
                              AppColors.accentLight,
                            ],
                          ),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          '$unread',
                          style: const TextStyle(
                            fontFamily: 'Poppins',
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
