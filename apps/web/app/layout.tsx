import type { Metadata } from "next";
import { Poppins, JetBrains_Mono } from "next/font/google";
import Sidebar from "./sidebar";
import { getCurrentUser } from "@/lib/auth";
import { ThemeProvider, themeInitScript } from "./theme-provider";
import "./globals.css";

// Self-hosted via next/font — replaces the render-blocking Google Fonts
// @import chain (2 extra origins in the critical path). Fonts are downloaded
// at build time and served from /_next/static with preload.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

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
    <html lang="en" data-theme="dark" className={`${poppins.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
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
