// apps/web/app/rating/page.tsx
//
// "Where do I stand" for everyone, and "where does the team stand, and let me
// set it" for admins and managers.
//
// ONE PAGE, TWO AUDIENCES:
//
//   A member sees themselves. There is no roster, no way to name anyone else,
//   and ?user= on the URL gets them bounced back to their own page.
//
//   An admin or manager sees a roster of the people they're responsible for,
//   picks one, and gets that person's standing WITH the editor, their signals,
//   and the actual tasks behind those numbers — so a rating is set while
//   looking at the work rather than at five aggregates.
//
// AUTHORISATION IS ONE CALL. loadStanding() returns null when the viewer may
// not see the subject, so a bad or forged ?user= lands on the same branch as a
// deleted account: back to your own page. Nothing downstream re-decides it.
//
// WHAT THIS PAGE STILL MUST NOT DO: promise a rating. No score, no threshold,
// no "3 more and you reach Strong". The standing is a human's judgement — a
// threshold here is a cheque only a manager can cash, and when they don't, the
// person has a grievance with a screenshot. Amit chose "show influence, not
// promises", and "manager decides" what counts.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb, projects, eq } from "@tu/db";
import { loadStanding, listStandingSubjects, TIER_LABEL, TIER_LETTER, TIER_COLOR } from "@/lib/standing";
import { getRatingSignals, getRelatedTasks, getImprovementTasks } from "@/lib/rating-signals";
import { StandingCard } from "@/components/standing-card";
import { ActionForm } from "@/components/action-form";
import { getBadgeProgress } from "@/lib/badges";
import { levelFromXp, getXpLeaderboard } from "@/lib/game";
import { GameHero, type BadgeView } from "./game-hero";
import { addImprovementTask, unlinkImprovementTask } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Rating · SeekPeak",
  description: "Your standing, and what shapes it",
};

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog", todo: "To do", in_progress: "In progress",
  review: "In review", done: "Done", cancelled: "Cancelled",
};

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(`${d}T12:00:00+05:30`) : d;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
  }).format(date);
}

export default async function RatingPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const me = await getCurrentUser();
  const requested = ((await searchParams).user ?? "").trim();
  const targetId = requested || me.id;

  // The single authorisation point. Null means "not yours to see" or "no such
  // person" — both resolve to your own page rather than an error, because
  // neither is worth a stack trace and neither should confirm the id existed.
  const standing = await loadStanding(me, targetId);
  if (!standing) redirect("/rating");

  const [signals, tasks, roster, growth, projectList, progress, leaders] = await Promise.all([
    getRatingSignals(targetId),
    getRelatedTasks(targetId),
    listStandingSubjects(me),
    getImprovementTasks(targetId),
    getDb().select({ id: projects.id, name: projects.name }).from(projects).orderBy(projects.name),
    getBadgeProgress(targetId),
    getXpLeaderboard(me.id),
  ]);

  // XP is derived from the badges actually earned — there is no stored balance
  // to drift, and nothing anyone can top up.
  const xp = progress.filter((p) => p.earned).reduce((sum, p) => sum + p.badge.xp, 0);
  const levelState = levelFromXp(xp);
  const badgeViews: BadgeView[] = progress.map((p) => ({
    key: p.badge.key,
    name: p.badge.name,
    description: p.badge.description,
    icon: p.badge.icon,
    color: p.badge.color,
    xp: p.badge.xp,
    earned: p.earned,
    current: p.current,
    target: p.badge.target,
  }));
  const myRank = leaders.find((l) => l.id === targetId)?.rank ?? null;

  const isSelf = targetId === me.id;
  // A roster of one is just your own name — not worth the furniture.
  const showRoster = roster.length > 1;
  const toDo = signals.filter((s) => s.tone === "attention");

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <h1 className="page-title">Rating</h1>
          <p className="page-sub">
            {isSelf
              ? "Where you stand, and what your manager can see."
              : `${standing.subjectName}'s standing, and the work behind it.`}
          </p>
        </div>
      </div>

      {showRoster ? (
        <nav className="rate-roster" aria-label="People">
          {roster.map((p) => {
            const on = p.id === targetId;
            return (
              <Link
                key={p.id}
                href={p.id === me.id ? "/rating" : `/rating?user=${p.id}`}
                className={`rate-chip ${on ? "is-on" : ""}`}
                aria-current={on ? "page" : undefined}
              >
                <span className="rate-chip-n">{p.id === me.id ? "You" : p.name.split(/\s+/)[0]}</span>
                {p.tier ? (
                  <span className="rate-chip-t" style={{ color: TIER_COLOR[p.tier] }}>
                    {TIER_LETTER[p.tier]} — {TIER_LABEL[p.tier]}
                  </span>
                ) : (
                  <span className="rate-chip-t is-unset">Not set</span>
                )}
              </Link>
            );
          })}
        </nav>
      ) : null}

      <div className="rate-wrap">
        {/* The editor appears inside this card on its own, whenever the viewer
            is allowed to set this person's standing — so an admin rates from
            here without going anywhere else. It never appears on your own. */}
        <StandingCard standing={standing} subjectName={standing.subjectName} />

        {/* The game layer, BELOW the standing on purpose. The standing is the
            answer to the question people arrive with; XP is not a route to it,
            however much putting it on top would imply otherwise. */}
        <GameHero state={levelState} badges={badgeViews} leaders={leaders} rank={myRank} />

        <section className="card rate-sec">
          <div className="rate-head">
            <h2 className="rate-h">{isSelf ? "What you've been asked to work on" : "Asked to work on"}</h2>
            <p className="rate-sub">
              {isSelf ? (
                <>
                  Specific things your manager raised, as real tasks with dates. Finishing them
                  doesn&rsquo;t move your standing on its own &mdash; a person still decides that &mdash; but
                  these are what they actually asked for.
                </>
              ) : (
                <>
                  Turn the reason you wrote into work they can act on. &ldquo;Communication can be
                  improved&rdquo; is hard to do anything with; &ldquo;run the Monday handover for a month&rdquo;
                  isn&rsquo;t.
                </>
              )}
            </p>
          </div>

          {growth.length === 0 ? (
            <div className="rate-body">
              <p className="rate-empty">
                {isSelf
                  ? "Nothing specific has been asked of you."
                  : "Nothing asked yet."}
              </p>
            </div>
          ) : (
            <ul className="rate-growth">
              {growth.map((g) => (
                <li key={g.id} className={`rate-g ${g.done ? "is-done" : ""} ${g.overdue ? "is-overdue" : ""}`}>
                  <span className="rate-g-mark" aria-hidden="true">{g.done ? "✓" : "○"}</span>
                  <Link href={`/tasks?task=${g.id}`} className="rate-g-t">{g.title}</Link>
                  <span className="rate-g-m">
                    {g.done
                      ? `done ${fmtDate(g.completedAt)}`
                      : g.dueDate
                        ? `${g.overdue ? "was due" : "by"} ${fmtDate(g.dueDate)}`
                        : "no date"}
                    {g.askedBy && !isSelf ? "" : g.askedBy ? ` · ${g.askedBy}` : ""}
                  </span>
                  {standing.canEdit ? (
                    <ActionForm action={unlinkImprovementTask} className="rate-g-x">
                      <input type="hidden" name="taskId" value={g.id} />
                      <button type="submit" className="rate-g-xb" aria-label="Withdraw this ask" title="Withdraw">×</button>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {standing.canEdit ? (
            <div className="rate-add">
              <ActionForm action={addImprovementTask} className="rate-add-f" resetOnSuccess>
                <input type="hidden" name="memberId" value={targetId} />
                <input
                  name="title" type="text" required maxLength={200}
                  placeholder="What should they work on? Be specific enough to finish."
                  className="rate-add-t"
                />
                <input name="dueDate" type="date" required className="rate-add-d" aria-label="By when" />
                <select name="projectId" className="rate-add-p" aria-label="Project" defaultValue="">
                  <option value="">Their usual project</option>
                  {projectList.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary btn-sm">Ask</button>
              </ActionForm>
            </div>
          ) : null}
        </section>

        <section className="card rate-sec">
          <div className="rate-head">
            <h2 className="rate-h">{isSelf ? "What your manager can see" : "What the record shows"}</h2>
            <p className="rate-sub">
              Facts, not a score. {isSelf ? "Your" : "A"} standing is set by a person who weighs these
              alongside things SeekPeak can&rsquo;t measure &mdash; how hard the work was, what
              {isSelf ? " you " : " they "}picked up for someone else, what went wrong that
              wasn&rsquo;t {isSelf ? "yours" : "theirs"}.
            </p>
          </div>

          {signals.length === 0 ? (
            <div className="rate-body">
              <p className="rate-empty">
                Nothing to show yet &mdash; no overdue work, and not enough finished in the last month to
                say anything useful about.
              </p>
            </div>
          ) : (
            <ul className="rate-list">
              {signals.map((s) => (
                <li key={s.key} className={`rate-item is-${s.tone}`}>
                  <div className="rate-fig">
                    <span className="rate-val">{s.value}</span>
                    <span className="rate-lab">{s.label}</span>
                  </div>
                  <div className="rate-say">
                    <p>{s.detail}</p>
                    {s.href && isSelf ? (
                      <Link href={s.href} className="rate-cta">{s.cta ?? "Open"} &rarr;</Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="rate-foot">
            {isSelf ? (
              toDo.length > 0 ? (
                <>
                  <strong>
                    {toDo.length === 1
                      ? "There's one thing above you could act on today."
                      : `There are ${toDo.length} things above you could act on today.`}
                  </strong>{" "}
                  None of them move your standing by themselves &mdash; a person decides that. But
                  they&rsquo;re the things most likely to come up when they do.
                </>
              ) : (
                <>
                  Nothing here needs attention. If you want to know what would strengthen your standing,
                  ask your manager directly &mdash; they can tell you what they&rsquo;re weighing, and this
                  page can&rsquo;t.
                </>
              )
            ) : (
              <>
                These are inputs, not a verdict. SeekPeak has no opinion on what this person&rsquo;s
                standing should be &mdash; deliberately. That judgement is yours, and the reason you write
                is what they actually read.
              </>
            )}
          </div>
        </section>

        {/* The work itself. A standing set while looking at five aggregates is
            a standing set from a dashboard; this is the thing being judged. */}
        <section className="card rate-sec">
          <div className="rate-head">
            <h2 className="rate-h">{isSelf ? "Your recent work" : "Recent work"}</h2>
            <p className="rate-sub">
              Open items and anything finished in the last 30 days. Overdue first.
            </p>
          </div>

          {tasks.length === 0 ? (
            <div className="rate-body">
              <p className="rate-empty">Nothing assigned, and nothing finished in the last month.</p>
            </div>
          ) : (
            <ul className="rate-tasks">
              {tasks.map((t) => (
                <li key={t.id} className={`rate-task ${t.overdue ? "is-overdue" : ""}`}>
                  <Link href={`/tasks?task=${t.id}`} className="rate-task-t">{t.title}</Link>
                  <span className="rate-task-s">{STATUS_LABEL[t.status] ?? t.status}</span>
                  <span className="rate-task-d">
                    {t.status === "done"
                      ? `done ${fmtDate(t.completedAt)}`
                      : t.dueDate
                        ? `${t.overdue ? "was due" : "due"} ${fmtDate(t.dueDate)}`
                        : "no date"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
