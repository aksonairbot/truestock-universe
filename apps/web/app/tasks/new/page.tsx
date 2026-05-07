import Link from "next/link";
import { getDb, projects, asc, isNull } from "@tu/db";
import { createTask } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const db = getDb();
  const projectList = await db
    .select({ slug: projects.slug, name: projects.name })
    .from(projects)
    .where(isNull(projects.archivedAt))
    .orderBy(asc(projects.name));

  return (
    <div className="min-h-screen px-6 md:px-8 py-6 max-w-[800px] mx-auto">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-semibold tracking-tight">New task</div>
          <div className="text-text-2 text-sm mt-1">
            Quick capture. Comments, attachments, dependencies coming next week.
          </div>
        </div>
        <Link href="/tasks" className="text-text-2 hover:text-text text-sm">
          ← Back to all tasks
        </Link>
      </div>

      <form action={createTask} className="card grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs text-text-3 uppercase tracking-wider">Title *</span>
          <input
            name="title"
            type="text"
            required
            autoFocus
            placeholder="What needs to happen?"
            className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full"
          />
        </label>

        <label className="flex flex-col gap-1 md:col-span-2">
          <span className="text-xs text-text-3 uppercase tracking-wider">Description</span>
          <textarea
            name="description"
            rows={4}
            placeholder="Context, acceptance criteria, links. Markdown supported."
            className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-sm w-full"
          ></textarea>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-3 uppercase tracking-wider">Project *</span>
          <select
            name="projectSlug"
            required
            defaultValue="skynet"
            className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
          >
            {projectList.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-3 uppercase tracking-wider">Status</span>
          <select
            name="status"
            defaultValue="todo"
            className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
          >
            <option value="backlog">Backlog</option>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-3 uppercase tracking-wider">Priority</span>
          <select
            name="priority"
            defaultValue="med"
            className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
          >
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-3 uppercase tracking-wider">Due date</span>
          <input
            name="dueDate"
            type="date"
            className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-sm w-full"
          />
        </label>

        <div className="flex items-center justify-end gap-3 md:col-span-2 pt-4 border-t border-border">
          <Link
            href="/tasks"
            className="text-text-2 hover:text-text text-sm px-4 py-2"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="bg-accent hover:bg-accent-2 text-white font-semibold text-sm rounded-md px-5 py-2 transition"
          >
            Create task
          </button>
        </div>
      </form>
    </div>
  );
}
