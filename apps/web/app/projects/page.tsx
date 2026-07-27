import Link from "next/link";
import { getDb, projects, tasks, users, eq, asc, isNull, sql } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { createProject } from "./actions";
import { ProjectBanner } from "./project-banner";

export const dynamic = "force-dynamic";

/**
 * Things-style completion ring — a glanceable "how far along is this
 * project" that fills as tasks close. Informational only: it measures the
 * project, never a person.
 */
function ProgressRing({ done, total }: { done: number; total: number }) {
  if (!total) return null;
  const pct = Math.round((done / total) * 100);
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <span className="proj-ring" title={`${pct}% complete · ${done} of ${total} tasks done`}>
      <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
        <circle cx="9" cy="9" r={r} fill="none" stroke="var(--border-2)" strokeWidth="2.6" />
        <circle
          cx="9" cy="9" r={r} fill="none"
          stroke={pct >= 100 ? "var(--success)" : "var(--accent-2)"}
          strokeWidth="2.6"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          strokeLinecap="round"
          transform="rotate(-90 9 9)"
          className="proj-ring-arc"
        />
      </svg>
      <span className="mono" style={{ fontSize: 11, color: pct >= 100 ? "var(--success)" : "var(--text-2)" }}>{pct}%</span>
    </span>
  );
}

export default async function ProjectsPage() {
  const me = await getCurrentUser();
  const db = getDb();

  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      description: projects.description,
      color: projects.color,
      iconUrl: projects.iconUrl,
      bannerUrl: projects.bannerUrl,
      owner: { id: users.id, name: users.name },
      total: sql<number>`count(${tasks.id})::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done'::task_status)::int`,
      open: sql<number>`count(*) filter (where ${tasks.status} not in ('done'::task_status, 'cancelled'::task_status))::int`,
    })
    .from(projects)
    .leftJoin(users, eq(projects.ownerId, users.id))
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(isNull(projects.archivedAt))
    .groupBy(projects.id, users.id, users.name)
    .orderBy(asc(projects.name));

  return (
    <div className="page-content">
      <div className="page-head">
        <div>
          <div className="page-title">Projects</div>
          <div className="page-sub">
            {rows.length} active · signed in as <span className="mono">{me.email}</span>
          </div>
        </div>
        <Link href="/tasks" className="btn btn-ghost">← Tasks</Link>
      </div>

      {rows.length === 0 ? (
        <div className="card text-center py-16 mb-6">
          <div className="text-text-2">No active projects yet — create one below.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {rows.map((p) => (
            <Link key={p.id} href={`/projects/${p.slug}`} className="card card-interactive group project-card-with-banner">
              <ProjectBanner
                slug={p.slug}
                title={p.name}
                productLabel={null}
                color={p.color}
                bannerUrl={p.bannerUrl}
                description={null}
                height="thumb"
              />
              <div className="project-card-body">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.iconUrl ? (
                      <img src={p.iconUrl} alt="" className="project-icon-sm" />
                    ) : (
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.color ?? "var(--text-3)" }}
                      />
                    )}
                    <div className="font-semibold text-[14px] truncate group-hover:text-accent-2">{p.name}</div>
                  </div>
                </div>
                {p.description ? (
                  <div className="text-[13px] text-text-2 line-clamp-2 mb-3">{p.description}</div>
                ) : (
                  <div className="text-[12px] text-text-3 italic mb-3">No description</div>
                )}
                <div className="flex items-center gap-3 text-[11.5px] text-text-3 mt-auto">
                  <ProgressRing done={p.done} total={p.total} />
                  <span><span className="text-text font-medium mono">{p.open}</span> open</span>
                  <span className="text-text-4">·</span>
                  <span><span className="text-text font-medium mono">{p.done}</span> done</span>
                  {p.owner?.name ? (
                    <>
                      <span className="text-text-4">·</span>
                      <span>{p.owner.name}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <details className="card">
        <summary className="text-[14px] font-semibold cursor-pointer">+ Create new project</summary>
        <form action={createProject} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Name</span>
            <input
              name="name"
              type="text"
              required
              placeholder="Marketing Q3 push"
              className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Slug (optional)</span>
            <input
              name="slug"
              type="text"
              pattern="[a-z0-9-]+"
              placeholder="auto from name"
              className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full mono"
            />
          </label>
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Description</span>
            <textarea
              name="description"
              rows={3}
              placeholder="What is this project for?"
              className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full"
            ></textarea>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Color</span>
            <input
              name="color"
              type="text"
              placeholder="#7B5CFF"
              pattern="#[0-9a-fA-F]{6}"
              className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full mono"
            />
          </label>
          <div className="md:col-span-2 flex justify-end pt-2">
            <button type="submit" className="btn btn-primary">Create project</button>
          </div>
        </form>
      </details>
    </div>
  );
}
