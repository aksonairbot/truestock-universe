import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import AppearanceSection from "./appearance-section";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings · SeekPeek",
  description: "User and workspace settings",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Manage your account and preferences</p>
        </div>
      </div>

      <div className="max-w-2xl">
        {/* Account section */}
        <section className="card mb-6">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text">Account</h2>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-text-2 mb-1">
                Email
              </label>
              <div className="text-[13px] text-text">{user.email}</div>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-text-2 mb-1">
                Name
              </label>
              <div className="text-[13px] text-text">{user.name}</div>
            </div>
          </div>
        </section>

        {/* Appearance section (client component for theme toggle) */}
        <AppearanceSection />

        {/* Preferences section */}
        <section className="card">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text">Preferences</h2>
          </div>
          <div className="px-6 py-4 space-y-4 text-[13px] text-text-2">
            <p>Additional settings coming soon.</p>
          </div>
        </section>

        {/* Organisation settings link — admin only */}
        {user.role === "admin" && (
          <section className="card mt-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-[14px] font-semibold text-text">Organisation</h2>
            </div>
            <div className="px-6 py-4">
              <Link
                href="/settings/organisation"
                className="inline-flex items-center gap-2 text-[13px] text-accent hover:underline"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Manage organisation settings
              </Link>
              <p className="text-[12px] text-text-2 mt-1">Company profile, team defaults, and app preferences</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
