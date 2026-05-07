import Link from "next/link";
import { getDb, projects, products, tasks, users, eq, asc, isNull, sql } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { createProject } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const me = await getCurrentUser();
  const db = getDb();

  // List projects with task counts (open vs done)
  const rows = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      name: projects.name,
      description: projects.description,
      color: projects.color,
      archivedAt: projects.archivedAt,
      product: { slug: products.slug, name: products.name },
      owner: { id: users.id, name: users.name },
      total: sql<number>`count(${tasks.id})::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
      open: sql<number>`count(*) filter (where ${tasks.status} not in ('done', 'cancelled'))::int`,
    })
    .from(projects)
    .leftJoin(products, eq(projects.productId, products.id))
    .leftJoin(users, eq(projects.ownerId, users.id))
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(isNull(projects.archivedAt))
    .groupBy(projects.id, products.slug, products.name, users.id, users.name)
    .orderBy(asc(projects.name));

  const productList = await db
    .select({ slug: products.slug, name: products.name })
    .from(products)
    .orderBy(asc(products.name));

  return (
    <div className="min-h-screen px-6 md:px-8 py-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Projects</div>
          <div className="text-text-2 text-sm mt-1">
            {rows.length} active project{rows.length === 1 ? "" : "s"} · signed in as{" "}
            <span className="mono">{me.email}</span>
          </div>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/tasks" className="text-text-2 hover:text-text px-3 py-2">
            ← Tasks
          </Link>
        </div>
      </div>

      {/* projects grid */}
      {rows.length === 0 ? (
        <div className="card text-center py-16 mb-6">
          <div className="text-text-2">No active projects yet — create one below.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {rows.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.slug}`}
              className="card hover:border-accent-2/40 transition group"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: p.color ?? "#888" }}
                  />
                  <div className="font-semibold group-hover:text-accent-2">{p.name}</div>
                </div>
                {p.product?.slug ? (
                  <span className="text-[10px] uppercase tracking-wider text-text-3 bg-panel-2 px-1.5 py-0.5 rounded">
                    {p.product.slug}
                  </span>
                ) : null}
              </div>
              {p.description ? (
                <div className="text-sm text-text-2 line-clamp-2 mb-3">{p.description}</div>
              ) : (
                <div className="text-xs text-text-3 italic mb-3">No description</div>
              )}
              <div className="flex items-center gap-3 text-xs text-text-3 mt-auto">
                <span>
                  <span className="text-text font-medium">{p.open}</span> open
                </span>
                <span>·</span>
                <span>
                  <span className="text-text font-medium">{p.done}</span> done
                </span>
                {p.owner?.name ? (
                  <>
                    <span>·</span>
                    <span>{p.owner.name}</span>
                  </>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* create project form */}
      <details className="card">
        <summary className="text-sm font-semibold cursor-pointer">+ Create new project</summary>
        <form action={createProject} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-text-3 uppercase tracking-wider">Name *</span>
            <input
              name="name"
              type="text"
              required
              placeholder="Marketing Q3 push"
              className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-3 uppercase tracking-wider">Slug (optional)</span>
            <input
              name="slug"
              type="text"
              pattern="[a-z0-9-]+"
              placeholder="auto from name"
              className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full mono"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-3 uppercase tracking-wider">Product (optional)</span>
            <select
              name="productSlug"
              defaultValue=""
              className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
            >
              <option value="">— internal/cross-cutting</option>
              {productList.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-text-3 uppercase tracking-wider">Description</span>
            <textarea
              name="description"
              rows={3}
              placeholder="What is this project for?"
              className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full"
            ></textarea>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-3 uppercase tracking-wider">Color</span>
            <input
              name="color"
              type="text"
              placeholder="#005e7e"
              pattern="#[0-9a-fA-F]{6}"
              className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full mono"
            />
          </label>

          <div className="md:col-span-2 flex justify-end pt-2">
            <button
              type="submit"
              className="bg-accent hover:bg-accent-2 text-white font-semibold text-sm rounded-md px-5 py-2 transition"
            >
              Create project
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
