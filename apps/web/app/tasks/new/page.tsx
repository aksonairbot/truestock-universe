import Link from "next/link";
import { getDb, projects, users, campaigns, asc, isNull, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { NewTaskForm } from "../new-task-form";
import { isChannel } from "@/lib/content";

export const dynamic = "force-dynamic";

interface PageProps {
  // Arriving from /content: ?content=1 opens the Publish block, and
  // ?channel= / ?date= prefill it. Everything is validated here — a bad
  // query string must never reach the insert.
  searchParams: Promise<{ content?: string; channel?: string; date?: string; campaign?: string }>;
}

export default async function NewTaskPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const channel = isChannel(sp.channel ?? "") ? sp.channel! : "";
  const publishDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : "";
  const campaignId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp.campaign ?? "")
    ? sp.campaign!
    : "";
  const contentMode = sp.content === "1" || Boolean(channel) || Boolean(publishDate) || Boolean(campaignId);

  const me = await getCurrentUser();
  const db = getDb();
  const projectList = await db
    .select({ slug: projects.slug, name: projects.name })
    .from(projects)
    .where(isNull(projects.archivedAt))
    .orderBy(asc(projects.name));

  const campaignList = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(isNull(campaigns.archivedAt))
    .orderBy(asc(campaigns.name));

  const userList = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.name));

  return (
    <div className="page-content max-w-[820px]">
      <div className="page-head">
        <div>
          <div className="page-title">{contentMode ? "New content" : "New task"}</div>
          <div className="page-sub">
            {contentMode
              ? "Quick capture. It lands on the content board as an idea."
              : "Quick capture. Use Suggest to triage with AI."}
          </div>
        </div>
        <Link href="/tasks" className="btn btn-ghost">← Back</Link>
      </div>
      <NewTaskForm
        projects={projectList}
        users={userList}
        currentUserId={me.id}
        userRole={me.role}
        initialChannel={channel}
        initialPublishDate={publishDate}
        initialCampaignId={campaignId}
        campaigns={campaignList}
        contentMode={contentMode}
      />
    </div>
  );
}
