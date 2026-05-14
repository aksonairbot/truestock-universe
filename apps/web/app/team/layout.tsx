// apps/web/app/team/layout.tsx
//
// Shared layout for /team/* pages — adds week/month tab switcher.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const isWeek = pathname.startsWith("/team/week");
  const isMonth = pathname.startsWith("/team/month");

  return (
    <div>
      {/* tab bar */}
      <div className="page-content pb-0">
        <div className="flex items-center gap-1 border-b border-border mb-0">
          <Link
            href="/team/week"
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition ${
              isWeek
                ? "border-accent-2 text-accent-2"
                : "border-transparent text-text-3 hover:text-text"
            }`}
          >
            Weekly
          </Link>
          <Link
            href="/team/month"
            className={`px-4 py-2.5 text-[13px] font-medium border-b-2 transition ${
              isMonth
                ? "border-accent-2 text-accent-2"
                : "border-transparent text-text-3 hover:text-text"
            }`}
          >
            Monthly
          </Link>
          <Link
            href="/month"
            className="px-4 py-2.5 text-[13px] font-medium border-b-2 border-transparent text-text-3 hover:text-text transition"
          >
            Org Rollup →
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
