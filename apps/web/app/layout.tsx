import type { Metadata } from "next";
import Sidebar from "./sidebar";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skynet · Truestock Universe",
  description: "Internal MIS · marketing engine · task management",
};

async function getSidebarUser() {
  // try/catch because Next prerenders /_not-found at build time
  // when DATABASE_URL may not be set.
  try {
    const me = await getCurrentUser();
    return { name: me.name, email: me.email, avatarUrl: me.avatarUrl };
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSidebarUser();
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="relative z-10 flex min-h-screen">
          <Sidebar user={user} />
          <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}
