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
    <div className="page-content max-w-[800px]">
      <div className="page-head">
        <div>
          <div className="page-title">New task</div>
          <div className="page-sub">Quick capture. Comments + attachments live on the task detail.</div>
        </div>
        <Link href="/tasks" className="btn btn-ghost">← Back</Link>
      </div>

      <form action={createTask} className="card grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Title</span>
          <input
            name="title"
            type="text"
            required
            autoFocus
            placeholder="What needs to happen?"
            className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full"
          />
        </label>

        <label className="flex flex-col gap-1.5 md:col-span-2">
          <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Description</span>
          <textarea
            name="description"
            rows={4}
            placeholder="Context, acceptance criteria, links."
            className="bg-panel-2 border border-border-2 rounded-md px-3 py-2 text-[13px] w-full"
          ></textarea>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Project</span>
          <select
            name="projectSlug"
            required
            defaultValue="skynet"
            className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-full"
          >
            {projectList.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Status</span>
          <select
            name="status"
            defaultValue="todo"
            className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-full"
          >
            <option value="backlog">Backlog</option>
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Priority</span>
          <select
            name="priority"
            defaultValue="med"
            className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-full"
          >
            <option value="low">Low</option>
            <option value="med">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] text-text-3 uppercase tracking-wider font-medium">Due date</span>
          <input
            name="dueDate"
            type="date"
            className="bg-panel-2 border border-border-2 rounded-md px-2 py-1.5 text-[13px] w-full"
          />
        </label>

        <div className="flex items-center justify-end gap-3 md:col-span-2 pt-3 border-t border-border">
          <Link href="/tasks" className="btn btn-ghost">Cancel</Link>
          <button type="submit" className="btn btn-primary">Create task</button>
        </div>
      </form>
    </div>
  );
}
