import Link from "next/link";
import { getDb, projects, users, asc, isNull, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { NewTaskForm } from "../new-task-form";

export const dynamic = "force-dynamic";

export default async function NewTaskPage() {
  const me = await getCurrentUser();
  const db = getDb();
  const projectList = await db
    .select({ slug: projects.slug, name: projects.name })
    .from(projects)
    .where(isNull(projects.archivedAt))
    .orderBy(asc(projects.name));

  const userList = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.name));

  return (
    <div className="page-content max-w-[820px]">
      <div className="page-head">
        <div>
          <div className="page-title">New task</div>
          <div className="page-sub">Quick capture. Use Suggest to triage with AI.</div>
        </div>
        <Link href="/tasks" className="btn btn-ghost">← Back</Link>
      </div>
      <NewTaskForm projects={projectList} users={userList} currentUserId={me.id} />
    </div>
  );
}
