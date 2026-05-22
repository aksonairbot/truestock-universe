import type { Metadata } from "next";
import Sidebar from "./sidebar";
import { getCurrentUser } from "@/lib/auth";
import { ThemeProvider, themeInitScript } from "./theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SeekPeak · Truestock",
  description: "SeekPeak — internal task management for Truestock",
  icons: {
    // The legacy PNG/ICO icons were generated with a "SeekPeak" wordmark
    // rasterised in. The SVG below is a typo-proof abstract mark (gradient
    // square + peeking eye glyph) and scales to every tab/PWA surface.
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  manifest: "/manifest.json",
};

async function getSidebarData() {
  // Only fetch the user — badge counts are loaded client-side by the Sidebar
  // to avoid blocking the entire page render.
  try {
    const me = await getCurrentUser();
    return {
      user: { name: me.name, email: me.email, avatarUrl: me.avatarUrl, role: me.role },
    };
  } catch {
    return { user: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getSidebarData();
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider>
          <div className="relative z-10 flex min-h-screen">
            <Sidebar user={user} isPrivileged={user?.role === "admin" || user?.role === "manager"} />
            <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
