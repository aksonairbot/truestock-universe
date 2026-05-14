// apps/web/app/welcome/page.tsx
//
// SeekPeek landing page — motion-rich hero with the brand icon,
// product showcase, feature grid, social proof strip, and sign-in.

import { SignInButton } from "./sign-in-button";

export const dynamic = "force-dynamic";

export default function WelcomePage() {
  const authEnabled = !!process.env.AUTH_SECRET;

  return (
    <div className="wlc">
      {/* Animated gradient background */}
      <div className="wlc-bg" />
      <div className="wlc-grain" />

      {/* Floating orbs for depth */}
      <div className="wlc-orb wlc-orb-1" />
      <div className="wlc-orb wlc-orb-2" />
      <div className="wlc-orb wlc-orb-3" />

      {/* Top nav */}
      <header className="wlc-nav">
        <div className="wlc-logo">
          <div className="wlc-brand-icon" />
          <span className="wlc-logo-text">SeekPeek</span>
        </div>
        <div className="wlc-nav-links">
          <a href="#features" className="wlc-nav-link">Features</a>
          <a href="#workflow" className="wlc-nav-link">How it works</a>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="wlc-hero">
        {/* Animated brand icon — large, central */}
        <div className="wlc-hero-icon">
          <div className="wlc-hero-icon-glow" />
          <div className="wlc-hero-icon-ring" />
          <div className="wlc-hero-icon-mark" />
        </div>

        <div className="wlc-badge wlc-fadein" style={{ animationDelay: "0.3s" }}>
          <span className="wlc-badge-dot" />
          AI-powered task management for focused teams
        </div>

        <h1 className="wlc-title wlc-fadein" style={{ animationDelay: "0.5s" }}>
          See the work.<br />
          <span className="wlc-title-accent">Ship the work.</span>
        </h1>

        <p className="wlc-subtitle wlc-fadein" style={{ animationDelay: "0.7s" }}>
          Capture a thought in plain English — AI assigns the project, picks the owner,
          sets priority and deadline. Morning briefings that name names.
          Streak chips only you can see.
        </p>

        {/* Sign-in card */}
        <div className="wlc-card wlc-fadein" style={{ animationDelay: "0.9s" }}>
          {authEnabled ? (
            <SignInButton />
          ) : (
            <a href="/" className="wlc-google-btn">
              Continue (auth setup pending)
            </a>
          )}
          <div className="wlc-card-note">
            Restricted to <span className="mono">truestock.in</span> accounts
          </div>
        </div>

        {/* Scroll hint */}
        <div className="wlc-scroll-hint wlc-fadein" style={{ animationDelay: "1.3s" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </section>

      {/* ── METRICS STRIP ── */}
      <section className="wlc-metrics wlc-fadein" style={{ animationDelay: "1.1s" }}>
        <div className="wlc-metric">
          <span className="wlc-metric-val">&#60;2s</span>
          <span className="wlc-metric-label">AI triage time</span>
        </div>
        <div className="wlc-metric-sep" />
        <div className="wlc-metric">
          <span className="wlc-metric-val">Zero</span>
          <span className="wlc-metric-label">manual assignment</span>
        </div>
        <div className="wlc-metric-sep" />
        <div className="wlc-metric">
          <span className="wlc-metric-val">6am</span>
          <span className="wlc-metric-label">daily briefing</span>
        </div>
        <div className="wlc-metric-sep" />
        <div className="wlc-metric">
          <span className="wlc-metric-val">100%</span>
          <span className="wlc-metric-label">private by default</span>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="wlc-section" id="features">
        <h2 className="wlc-section-title">
          Everything your team needs.<br />
          <span className="wlc-title-accent">Nothing it doesn't.</span>
        </h2>

        <div className="wlc-features">
          <div className="wlc-feat wlc-feat-lg">
            <div className="wlc-feat-icon wlc-feat-icon-ai">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="22" height="22">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <div className="wlc-feat-title">Quick Capture with AI Triage</div>
            <div className="wlc-feat-body">
              Type a sentence like "refund-rate spike on Stock Bee, investigate today" —
              SeekPeek picks the project, assigns the right person, sets priority and
              due date in under 2 seconds.
            </div>
            <div className="wlc-feat-demo">
              <div className="wlc-demo-input">
                <span className="wlc-demo-cursor" />
                refund-rate spike on Stock Bee, investigate today
              </div>
              <div className="wlc-demo-result">
                <span className="wlc-demo-chip wlc-demo-chip-project">Stock Bee</span>
                <span className="wlc-demo-chip wlc-demo-chip-prio">urgent</span>
                <span className="wlc-demo-chip wlc-demo-chip-user">→ Amit</span>
                <span className="wlc-demo-chip wlc-demo-chip-due">due today</span>
              </div>
            </div>
          </div>

          <div className="wlc-feat">
            <div className="wlc-feat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 2v4M16 2v4" />
                <circle cx="12" cy="15" r="1.4" fill="currentColor" />
              </svg>
            </div>
            <div className="wlc-feat-title">Morning Briefings</div>
            <div className="wlc-feat-body">
              Every day at 6 AM, AI reads your board and writes a briefing
              that names specific tasks, surfaces blockers, and asks one honest question.
            </div>
          </div>

          <div className="wlc-feat">
            <div className="wlc-feat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <div className="wlc-feat-title">Clarity Check</div>
            <div className="wlc-feat-body">
              Before a task ships, AI reviews the description and flags ambiguity —
              vague acceptance criteria, missing context, unclear scope.
            </div>
          </div>

          <div className="wlc-feat">
            <div className="wlc-feat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div className="wlc-feat-title">Private Streaks</div>
            <div className="wlc-feat-body">
              Your closure streak, personal bests, milestone badges — visible
              only to you. Motivation without surveillance.
            </div>
          </div>

          <div className="wlc-feat">
            <div className="wlc-feat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="wlc-feat-title">Team Dashboards</div>
            <div className="wlc-feat-body">
              Weekly and monthly views for managers — per-member cards showing
              done, active, and overdue counts. No public scores.
            </div>
          </div>

          <div className="wlc-feat">
            <div className="wlc-feat-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
              </svg>
            </div>
            <div className="wlc-feat-title">Team Chat</div>
            <div className="wlc-feat-body">
              Quick conversations right next to your tasks — no context-switching
              to a separate app. Threaded, searchable, integrated.
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="wlc-section" id="workflow">
        <h2 className="wlc-section-title">
          From thought to done<br />
          <span className="wlc-title-accent">in three moves.</span>
        </h2>

        <div className="wlc-steps">
          <div className="wlc-step">
            <div className="wlc-step-num">1</div>
            <div className="wlc-step-content">
              <div className="wlc-step-title">Capture</div>
              <div className="wlc-step-body">
                Type a thought in plain English. AI picks project, assignee,
                priority, and due date instantly.
              </div>
            </div>
          </div>
          <div className="wlc-step-line" />
          <div className="wlc-step">
            <div className="wlc-step-num">2</div>
            <div className="wlc-step-content">
              <div className="wlc-step-title">Focus</div>
              <div className="wlc-step-body">
                Your Today page shows exactly what matters — AI-written briefings,
                overdue flags, team velocity at a glance.
              </div>
            </div>
          </div>
          <div className="wlc-step-line" />
          <div className="wlc-step">
            <div className="wlc-step-num">3</div>
            <div className="wlc-step-content">
              <div className="wlc-step-title">Ship</div>
              <div className="wlc-step-body">
                Drag to done. Your streak grows. Badges unlock.
                Weekly dashboards keep the team aligned without standups.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="wlc-cta">
        <div className="wlc-cta-icon">
          <div className="wlc-brand-icon wlc-brand-icon-lg" />
        </div>
        <h2 className="wlc-cta-title">Ready to ship faster?</h2>
        <p className="wlc-cta-sub">
          Join your team on SeekPeek — the task manager that thinks before you do.
        </p>
        <div className="wlc-card" style={{ border: "none", background: "transparent", boxShadow: "none", padding: "0" }}>
          {authEnabled ? (
            <SignInButton />
          ) : (
            <a href="/" className="wlc-google-btn">
              Continue (auth setup pending)
            </a>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="wlc-foot">
        <span>SeekPeek · Truestock</span>
        <span>Built for teams that ship</span>
      </footer>
    </div>
  );
}
