"use client";

const ITEMS = [
  "AI Triage", "Auto Assign", "Priority Engine", "Streak Tracking",
  "Team Dashboards", "Private by Design", "Ship Faster", "Morning Briefings",
  "Clarity Check", "Smart Capture",
];

export function Marquee() {
  // Duplicate for seamless loop
  const all = [...ITEMS, ...ITEMS];

  return (
    <div className="lp-marquee">
      <div className="lp-marquee-track">
        {all.map((item, i) => (
          <span key={i} className="lp-marquee-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
