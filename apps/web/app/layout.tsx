import type { Metadata } from "next";
import Sidebar from "./sidebar";
import { getCurrentUser } from "@/lib/auth";
import { getDb, projects, isNull, asc } from "@tu/db";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skynet · Truestock Universe",
  description: "Internal MIS · marketing engine · task management",
};

async function getSidebarData() {
  // Wrapped in try/catch because Next prerenders /_not-found at build time
  // when DATABASE_URL may not be set.
  try {
    const me = await getCurrentUser();
    const db = getDb();
    const ps = await db
      .select({ slug: projects.slug, name: projects.name, color: projects.color })
      .from(projects)
      .where(isNull(projects.archivedAt))
      .orderBy(asc(projects.name));
    return {
      user: { name: me.name, email: me.email, avatarUrl: me.avatarUrl },
      projects: ps,
    };
  } catch {
    return { user: null, projects: [] };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user, projects: projectsList } = await getSidebarData();
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar user={user} projects={projectsList} />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
