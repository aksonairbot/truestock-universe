// apps/web/app/welcome/page.tsx
//
// SeekPeek marketing landing page — full sections with motion.

import { SignInButton } from "./sign-in-button";
import { Marquee } from "./marquee";

export const dynamic = "force-dynamic";

export default function WelcomePage() {
  const authEnabled = !!process.env.AUTH_SECRET;

  return (
    <div className="lp">
      {/* BG layers */}
      <div className="lp-bg" />
      <div className="lp-grain" />

      {/* ── NAV ── */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <a href="/" className="lp-nav-brand">
            <div className="lp-brand-icon" />
            <span>SeekPeek</span>
          </a>
          <nav className="lp-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#showcase">Product</a>
          </nav>
          <div className="lp-nav-right">
            {authEnabled ? <SignInButton variant="nav" /> : <a href="/" className="lp-btn-ghost">Log in</a>}
            {authEnabled ? <SignInButton variant="primary" /> : <a href="/" className="lp-btn-primary">Get started</a>}
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="lp-hero">
        <div className="lp-hero-content lp-fadein" style={{ animationDelay: "0.15s" }}>
          <div className="lp-pill">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="13" height="13"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            AI-powered task management for focused teams
          </div>

          <h1 className="lp-hero-title">
            See the work.<br />
            <span className="lp-grad-text">Ship the work.</span>
          </h1>

          <p className="lp-hero-sub">
            Capture thoughts in plain English. AI turns them into action,
            assigns the right people and keeps everyone aligned —
            automatically.
          </p>

          <div className="lp-hero-actions">
            {authEnabled ? (
              <SignInButton variant="hero" />
            ) : (
              <a href="/" className="lp-btn-primary lp-btn-lg">Get started for free →</a>
            )}
            <a href="#showcase" className="lp-btn-outline lp-btn-lg">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z" /></svg>
              Watch demo
            </a>
          </div>

          <div className="lp-social-proof">
            <div className="lp-avatars">
              <div className="lp-ava" style={{ background: "linear-gradient(135deg,#7B5CFF,#22D3EE)" }}>A</div>
              <div className="lp-ava" style={{ background: "linear-gradient(135deg,#F472B6,#7B5CFF)" }}>R</div>
              <div className="lp-ava" style={{ background: "linear-gradient(135deg,#22D3EE,#4ADE80)" }}>S</div>
              <div className="lp-ava" style={{ background: "linear-gradient(135deg,#FBBF24,#F472B6)" }}>K</div>
            </div>
            <span>Loved by focused teams worldwide</span>
          </div>
        </div>

        {/* 3D floating icon */}
        <div className="lp-hero-visual lp-fadein" style={{ animationDelay: "0.4s" }}>
          <div className="lp-icon-scene">
            <div className="lp-icon-glow" />
            <div className="lp-icon-ring lp-icon-ring-1" />
            <div className="lp-icon-ring lp-icon-ring-2" />
            <div className="lp-icon-3d">
              <div className="lp-icon-3d-face" />
            </div>
          </div>

          {/* Floating feature pills */}
          <div className="lp-float-pill lp-fp-1 lp-fadein" style={{ animationDelay: "0.8s" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            <div><strong>AI Triage</strong><br /><span>Smart capture</span></div>
          </div>
          <div className="lp-float-pill lp-fp-2 lp-fadein" style={{ animationDelay: "1.0s" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><circle cx="9" cy="8" r="3" /><path d="M3 21c1-3 3.5-5 6-5s5 2 6 5" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <div><strong>Auto Assign</strong><br /><span>Right owner</span></div>
          </div>
          <div className="lp-float-pill lp-fp-3 lp-fadein" style={{ animationDelay: "1.2s" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            <div><strong>Set Priority</strong><br /><span>What matters</span></div>
          </div>
          <div className="lp-float-pill lp-fp-4 lp-fadein" style={{ animationDelay: "1.4s" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
            <div><strong>Track Progress</strong><br /><span>Stay on track</span></div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <Marquee />

      {/* ── SHOWCASE ── */}
      <section className="lp-section lp-showcase" id="showcase">
        <div className="lp-showcase-grid">
          <div className="lp-showcase-text">
            <h2 className="lp-section-title" style={{ textAlign: "left" }}>
              Your day,<br /><span className="lp-grad-text">in flow.</span>
            </h2>
            <p className="lp-showcase-sub">
              Everything you need to plan, focus, and ship — all in one
              beautiful workspace.
            </p>

            <div className="lp-showcase-bullets">
              <div className="lp-showcase-bullet">
                <div className="lp-sb-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                </div>
                <div>
                  <strong>Spot what matters</strong>
                  <span>AI highlights the important work.</span>
                </div>
              </div>
              <div className="lp-showcase-bullet">
                <div className="lp-sb-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                </div>
                <div>
                  <strong>Move with clarity</strong>
                  <span>See priorities, owners, and impact.</span>
                </div>
              </div>
              <div className="lp-showcase-bullet">
                <div className="lp-sb-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                </div>
                <div>
                  <strong>Ship with momentum</strong>
                  <span>Build streaks. Hit goals. Repeat.</span>
                </div>
              </div>
            </div>
          </div>

          {/* App mockup */}
          <div className="lp-mockup">
            <div className="lp-mockup-window">
              <div className="lp-mock-sidebar">
                <div className="lp-mock-brand"><div className="lp-brand-icon" style={{ width: 18, height: 18, borderRadius: 5 }} /><span>SeekPeek</span></div>
                <div className="lp-mock-nav-item lp-mock-active">Quick Capture</div>
                <div className="lp-mock-nav-item">Morning Briefings</div>
                <div className="lp-mock-nav-item">Clarity Check</div>
                <div className="lp-mock-nav-item">Private Streaks</div>
                <div className="lp-mock-nav-item">Team Dashboards</div>
                <div className="lp-mock-nav-item">Team Chat</div>
                <div className="lp-mock-spacer" />
                <div className="lp-mock-nav-item">Settings</div>
                <div className="lp-mock-user">
                  <div className="lp-ava" style={{ width: 22, height: 22, fontSize: 9, background: "linear-gradient(135deg,#7B5CFF,#F472B6)" }}>R</div>
                  <span>Robert Fox<br /><small>Product Designer</small></span>
                </div>
              </div>
              <div className="lp-mock-main">
                <div className="lp-mock-header">
                  <span>Good morning, Robert <span role="img" aria-label="wave">👋</span></span>
                  <span className="lp-mock-muted">Here&apos;s what&apos;s moving today.</span>
                </div>
                <div className="lp-mock-stats">
                  <div className="lp-mock-stat"><span className="lp-mock-stat-n">12</span><span>Tasks Captured</span></div>
                  <div className="lp-mock-stat"><span className="lp-mock-stat-n" style={{ color: "#22D3EE" }}>8</span><span>Tasks Assigned</span></div>
                  <div className="lp-mock-stat"><span className="lp-mock-stat-n" style={{ color: "#FBBF24" }}>5</span><span>Due Today</span></div>
                  <div className="lp-mock-stat"><span className="lp-mock-stat-n" style={{ color: "#4ADE80" }}>23</span><span>Day Streak</span></div>
                </div>
                <div className="lp-mock-section-title">Today&apos;s Focus</div>
                <div className="lp-mock-tasks">
                  <div className="lp-mock-task">
                    <span className="lp-mock-dot" style={{ background: "#EF4444" }} />
                    Refund-rate spike on Stock Bee
                    <span className="lp-mock-chip" style={{ background: "rgba(245,184,74,0.15)", color: "#FBCD7D" }}>Stock Bee</span>
                    <span className="lp-mock-chip" style={{ background: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}>urgent</span>
                  </div>
                  <div className="lp-mock-task">
                    <span className="lp-mock-dot" style={{ background: "#FBBF24" }} />
                    Investigate conversion drop on checkout
                    <span className="lp-mock-chip" style={{ background: "rgba(74,222,128,0.12)", color: "#86EFAC" }}>Growth</span>
                  </div>
                  <div className="lp-mock-task">
                    <span className="lp-mock-dot" style={{ background: "#22D3EE" }} />
                    Fix onboarding flow for mobile users
                    <span className="lp-mock-chip" style={{ background: "rgba(123,92,255,0.12)", color: "#C8BBFF" }}>Product</span>
                  </div>
                  <div className="lp-mock-task">
                    <span className="lp-mock-dot" style={{ background: "#4ADE80" }} />
                    Prepare investor update deck
                    <span className="lp-mock-chip" style={{ background: "rgba(244,114,182,0.12)", color: "#F9B5D7" }}>Company</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="lp-section" id="features">
        <h2 className="lp-section-title">
          Powerful <span className="lp-grad-text">features.</span><br />
          <span className="lp-grad-text">Effortless</span> results.
        </h2>

        <div className="lp-features">
          <div className="lp-feat">
            <div className="lp-feat-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="24" height="24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg></div>
            <h3>Lightning Fast Capture</h3>
            <p>Say it in plain English. AI turns it into an actionable task instantly.</p>
          </div>
          <div className="lp-feat">
            <div className="lp-feat-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="24" height="24"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg></div>
            <h3>AI That Knows Your Context</h3>
            <p>Smarter suggestions, better assignments, fewer follow-ups.</p>
          </div>
          <div className="lp-feat">
            <div className="lp-feat-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="24" height="24"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" /></svg></div>
            <h3>Focus on What Matters</h3>
            <p>Priorities, deadlines and owners set automatically.</p>
          </div>
          <div className="lp-feat">
            <div className="lp-feat-icon-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="24" height="24"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg></div>
            <h3>Privacy by Design</h3>
            <p>Your streaks and habits stay yours. Always.</p>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="lp-section" id="how">
        <div className="lp-how-grid">
          <h2 className="lp-section-title lp-how-title">
            From thought<br />to done<br /><span className="lp-grad-text">in three moves.</span>
          </h2>

          <div className="lp-steps">
            <div className="lp-step">
              <div className="lp-step-num">1</div>
              <div className="lp-step-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              </div>
              <h3>Capture</h3>
              <p>Type a thought in plain English. AI picks project, assignee, priority, and due date instantly.</p>
            </div>
            <div className="lp-step-connector" />
            <div className="lp-step">
              <div className="lp-step-num">2</div>
              <div className="lp-step-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><circle cx="9" cy="8" r="3" /><path d="M3 21c1-3 3.5-5 6-5s5 2 6 5" /><circle cx="17" cy="9" r="2.5" /><path d="M22 19c-.4-2-1.7-3.5-3.7-4" /></svg>
              </div>
              <h3>Focus</h3>
              <p>Your Today page shows exactly what matters — AI-written briefings, overdue flags, team velocity at a glance.</p>
            </div>
            <div className="lp-step-connector" />
            <div className="lp-step">
              <div className="lp-step-num">3</div>
              <div className="lp-step-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="22" height="22"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
              </div>
              <h3>Ship</h3>
              <p>Drag to done. Your streak grows. Badges unlock. Dashboards keep the team aligned without standups.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta">
        <div className="lp-cta-glow" />
        <div className="lp-brand-icon lp-brand-icon-lg" style={{ marginBottom: 24 }} />
        <h2 className="lp-cta-title">Ready to ship faster?</h2>
        <p className="lp-cta-sub">
          Join thousands of focused teams using SeekPeek to stay aligned and get more done.
        </p>
        <div className="lp-cta-actions">
          {authEnabled ? (
            <SignInButton variant="hero" />
          ) : (
            <a href="/" className="lp-btn-primary lp-btn-lg">Get started for free →</a>
          )}
          <a href="mailto:aks@truestock.in" className="lp-btn-outline lp-btn-lg">Book a demo</a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <div className="lp-nav-brand" style={{ marginBottom: 10 }}>
              <div className="lp-brand-icon" />
              <span>SeekPeek</span>
            </div>
            <p>AI-powered task management for focused teams.</p>
          </div>
          <div className="lp-footer-col">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#showcase">Product</a>
          </div>
          <div className="lp-footer-col">
            <h4>Resources</h4>
            <a href="#">Docs</a>
            <a href="#">Help Center</a>
            <a href="#">Templates</a>
          </div>
          <div className="lp-footer-col">
            <h4>Company</h4>
            <a href="#">About us</a>
            <a href="#">Careers</a>
            <a href="mailto:aks@truestock.in">Contact us</a>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>&copy; 2026 SeekPeek. All rights reserved.</span>
          <div className="lp-footer-legal">
            <a href="#">Terms</a>
            <a href="#">Privacy</a>
            <a href="#">Security</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
