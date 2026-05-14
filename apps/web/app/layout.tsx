import type { Metadata } from "next";
import Sidebar from "./sidebar";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "SeekPeek · Truestock",
  description: "SeekPeek — internal task management for Truestock",
};

async function getSidebarData() {
  // try/catch because Next prerenders /_not-found at build time
  // when DATABASE_URL may not be set.
  try {
    const me = await getCurrentUser();
    const { getUnreadCount } = await import("@/lib/notify");
    const { getUnreadChatCount } = await import("@/app/chat/actions");
    const [unread, chatUnread] = await Promise.all([getUnreadCount(me.id), getUnreadChatCount()]);
    return {
      user: { name: me.name, email: me.email, avatarUrl: me.avatarUrl, role: me.role },
      unread,
      chatUnread,
    };
  } catch {
    return { user: null, unread: 0, chatUnread: 0 };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user, unread, chatUnread } = await getSidebarData();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <div className="relative z-10 flex min-h-screen">
          <Sidebar user={user} unreadCount={unread} chatUnreadCount={chatUnread} isPrivileged={user?.role === "admin" || user?.role === "manager"} />
          <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
