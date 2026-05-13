// apps/web/app/welcome/page.tsx
//
// SeekPeek landing page. Unauthenticated visitors land here. The Google
// sign-in CTA only succeeds for emails that already exist in the users
// table (admins pre-provision via /members).

import Link from "next/link";
import { SignInButton } from "./sign-in-button";

export const dynamic = "force-dynamic";

export default function WelcomePage() {
  const authEnabled = !!process.env.AUTH_SECRET;

  return (
    <div className="welcome">
      <div className="welcome-hero" style={{ backgroundImage: "url(/hero/today.webp)" }}>
        <div className="welcome-hero-fade" />
        <header className="welcome-nav">
          <div className="welcome-brand">
            <span className="brand-mark" />
            <div>
              <div className="welcome-brand-name">SeekPeek</div>
              <div className="welcome-brand-sub">Truestock</div>
            </div>
          </div>
          <a href="mailto:aks@truestock.in" className="welcome-nav-link">Contact admin</a>
        </header>

        <div className="welcome-headline">
          <div className="welcome-kicker">Internal · Truestock team only</div>
          <h1>The eagle-eye view for your day.</h1>
          <p>
            Tasks, projects, and people — one place. AI triage when you capture, AI summary when you check in, and a quiet streak chip that only you can see.
          </p>
          <div className="welcome-cta">
            {authEnabled ? (
              <SignInButton />
            ) : (
              <div className="welcome-stub">
                <Link href="/" className="welcome-btn welcome-btn-primary">
                  Continue (stub auth — admin set-up pending)
                </Link>
              </div>
            )}
            <div className="welcome-note">
              Sign-in is restricted to <span className="mono">truestock.in</span> accounts an admin has already added.
            </div>
          </div>
        </div>
      </div>

      <section className="welcome-features">
        <Feature
          title="Capture in one keystroke"
          body="Type a sentence, hit Cmd+Enter — AI picks project, assignee, priority, due. Skip the form."
        />
        <Feature
          title="A coach, not a cheerleader"
          body="Morning briefing names specific tasks, surfaces what's stuck, and asks one honest question."
        />
        <Feature
          title="See the team without surveillance"
          body="Workload chips, top closers, velocity trends. No public scores, no leaderboards beyond a quiet top-3."
        />
        <Feature
          title="Streaks that stay private"
          body="Your closure streak, your personal best, your milestones. Visible only to you. Confetti is rare on purpose."
        />
      </section>

      <footer className="welcome-foot">
        <span>SeekPeek · built for Truestock</span>
        <span className="mono">truestock.in members only</span>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="welcome-feature">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
