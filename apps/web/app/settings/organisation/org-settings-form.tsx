"use client";

import { useState, useTransition } from "react";
import { updateOrgSettings } from "../org-actions";

type Settings = {
  id: string;
  companyName: string;
  logoUrl: string | null;
  domain: string | null;
  timezone: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: number[];
  defaultRole: string;
  reviewCycleFrequency: string;
  notifyOnTaskAssign: boolean;
  notifyOnReviewStart: boolean;
  notifyOnDueSoon: boolean;
};

const TABS = [
  { key: "company", label: "Company Profile" },
  { key: "team", label: "Team & Roles" },
  { key: "preferences", label: "App Preferences" },
] as const;

type Tab = (typeof TABS)[number]["key"];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIMEZONES = [
  "Asia/Kolkata",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

export function OrgSettingsForm({ settings }: { settings: Settings }) {
  const [tab, setTab] = useState<Tab>("company");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    fd.set("settingsId", settings.id);
    startTransition(async () => {
      try {
        await updateOrgSettings(fd);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err: any) {
        setError(err.message ?? "Failed to save");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="org-settings-form">
      {/* Tab bar */}
      <div className="org-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`org-tab ${tab === t.key ? "is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Company Profile */}
      {tab === "company" && (
        <div className="org-section">
          <div className="org-field">
            <label className="org-label">Company Name</label>
            <input
              name="companyName"
              defaultValue={settings.companyName}
              className="org-input"
              required
            />
          </div>

          <div className="org-field">
            <label className="org-label">Domain</label>
            <input
              name="domain"
              defaultValue={settings.domain ?? ""}
              className="org-input"
              placeholder="e.g. yourcompany.com"
            />
            <span className="org-hint">Used for email matching during sign-up</span>
          </div>

          <div className="org-field">
            <label className="org-label">Timezone</label>
            <select name="timezone" defaultValue={settings.timezone} className="org-input">
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

          <div className="org-row">
            <div className="org-field">
              <label className="org-label">Working Hours Start</label>
              <input
                type="time"
                name="workingHoursStart"
                defaultValue={settings.workingHoursStart}
                className="org-input"
              />
            </div>
            <div className="org-field">
              <label className="org-label">Working Hours End</label>
              <input
                type="time"
                name="workingHoursEnd"
                defaultValue={settings.workingHoursEnd}
                className="org-input"
              />
            </div>
          </div>

          <div className="org-field">
            <label className="org-label">Working Days</label>
            <div className="org-days">
              {DAY_LABELS.map((label, idx) => (
                <label key={idx} className="org-day-check">
                  <input
                    type="checkbox"
                    name={`workingDay_${idx}`}
                    defaultChecked={settings.workingDays.includes(idx)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Team & Roles */}
      {tab === "team" && (
        <div className="org-section">
          <div className="org-field">
            <label className="org-label">Default Role for New Members</label>
            <select name="defaultRole" defaultValue={settings.defaultRole} className="org-input">
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
              <option value="manager">Manager</option>
            </select>
            <span className="org-hint">Role assigned to users who join via SSO without explicit assignment</span>
          </div>

          <div className="org-field">
            <label className="org-label">Review Cycle Frequency</label>
            <select name="reviewCycleFrequency" defaultValue={settings.reviewCycleFrequency} className="org-input">
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="biannual">Bi-annual</option>
              <option value="annual">Annual</option>
            </select>
            <span className="org-hint">Default frequency when creating new review cycles</span>
          </div>

          <div className="org-info-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            <p>Manage departments and team structure from the <a href="/members" className="org-link">Members</a> page.</p>
          </div>
        </div>
      )}

      {/* App Preferences */}
      {tab === "preferences" && (
        <div className="org-section">
          <div className="org-field">
            <label className="org-label">Notification Defaults</label>
            <span className="org-hint">Configure which notifications are enabled by default for all users</span>
          </div>

          <label className="org-toggle">
            <input
              type="checkbox"
              name="notifyOnTaskAssign"
              defaultChecked={settings.notifyOnTaskAssign}
            />
            <span className="org-toggle-label">Notify on task assignment</span>
          </label>

          <label className="org-toggle">
            <input
              type="checkbox"
              name="notifyOnReviewStart"
              defaultChecked={settings.notifyOnReviewStart}
            />
            <span className="org-toggle-label">Notify when review cycle starts</span>
          </label>

          <label className="org-toggle">
            <input
              type="checkbox"
              name="notifyOnDueSoon"
              defaultChecked={settings.notifyOnDueSoon}
            />
            <span className="org-toggle-label">Notify when task is due soon (48h)</span>
          </label>
        </div>
      )}

      {/* Footer */}
      <div className="org-footer">
        {error && <div className="org-error">{error}</div>}
        {saved && <div className="org-saved">Settings saved successfully</div>}
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
