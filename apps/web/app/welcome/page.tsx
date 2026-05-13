// apps/web/app/welcome/page.tsx
//
// SeekPeek landing page — centered hero with glass sign-in card.

import { SignInButton } from "./sign-in-button";

export const dynamic = "force-dynamic";

export default function WelcomePage() {
  const authEnabled = !!process.env.AUTH_SECRET;

  return (
    <div className="wlc">
      {/* Animated gradient background */}
      <div className="wlc-bg" />
      <div className="wlc-grain" />

      {/* Top nav */}
      <header className="wlc-nav">
        <div className="wlc-logo">
          <div className="wlc-logo-mark">
            <svg viewBox="0 0 32 32" fill="none" width="24" height="24">
              <path d="M8 6l8 4 8-4v14l-8 6-8-6V6z" stroke="currentColor" strokeWidth="1.8" fill="rgba(123,92,255,0.15)" />
              <path d="M16 10v16M8 6l8 10 8-10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <span className="wlc-logo-text">SeekPeek</span>
        </div>
      </header>

      {/* Center content */}
      <div className="wlc-center">
        <div className="wlc-badge">Task management for focused teams</div>

        <h1 className="wlc-title">
          See the work.<br />
          <span className="wlc-title-accent">Ship the work.</span>
        </h1>

        <p className="wlc-subtitle">
          Tasks, projects, and people in one place. AI triage on capture,
          morning briefings that name names, and streak chips only you can see.
        </p>

        {/* Sign-in card */}
        <div className="wlc-card">
          {authEnabled ? (
            <SignInButton />
          ) : (
            <a href="/" className="wlc-google-btn">
              Continue (auth setup pending)
            </a>
          )}
          <div className="wlc-card-note">
            Restricted to pre-approved <span className="mono">truestock.in</span> accounts
          </div>
        </div>
      </div>

      {/* Feature strip */}
      <div className="wlc-features">
        <div className="wlc-feat">
          <div className="wlc-feat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="20" height="20">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div className="wlc-feat-title">AI triage</div>
          <div className="wlc-feat-body">Type a sentence — AI picks project, assignee, priority, and due date</div>
        </div>
        <div className="wlc-feat">
          <div className="wlc-feat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="20" height="20">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </div>
          <div className="wlc-feat-title">Morning briefing</div>
          <div className="wlc-feat-body">Names specific tasks, surfaces blockers, asks one honest question</div>
        </div>
        <div className="wlc-feat">
          <div className="wlc-feat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="20" height="20">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <div className="wlc-feat-title">Private streaks</div>
          <div className="wlc-feat-body">Your closure streak, personal bests, milestones — visible only to you</div>
        </div>
        <div className="wlc-feat">
          <div className="wlc-feat-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="20" height="20">
              <circle cx="9" cy="8" r="3" />
              <path d="M3 21c1-3 3.5-5 6-5s5 2 6 5" />
              <circle cx="17" cy="9" r="2.5" />
              <path d="M22 19c-.4-2-1.7-3.5-3.7-4" />
            </svg>
          </div>
          <div className="wlc-feat-title">Team clarity</div>
          <div className="wlc-feat-body">Workload chips, velocity trends — no surveillance, no public scores</div>
        </div>
      </div>

      {/* Footer */}
      <footer className="wlc-foot">
        <span>SeekPeek · Truestock</span>
        <span>seekpeak.in</span>
      </footer>
    </div>
  );
}
