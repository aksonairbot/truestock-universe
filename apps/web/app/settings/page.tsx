import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";

export const metadata = {
  title: "Settings · Skynet",
  description: "User and workspace settings",
};

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your account and preferences</p>
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

        {/* Preferences section */}
        <section className="card">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text">Preferences</h2>
          </div>
          <div className="px-6 py-4 space-y-4 text-[13px] text-text-2">
            <p>Additional settings coming soon.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
