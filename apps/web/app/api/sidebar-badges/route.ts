// apps/web/app/api/sidebar-badges/route.ts
//
// Lightweight API route returning sidebar badge counts.
// Called client-side by the Sidebar so the layout can render instantly
// without blocking on notification + chat queries.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, sql, notifications, eq, and } from "@tu/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const me = await getCurrentUser();
    const db = getDb();

    // Run both counts in parallel
    const [unreadRow, chatRow] = await Promise.all([
      // Notification unread count (indexed)
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, me.id), sql`${notifications.readAt} is null`)),
      // Chat unread count — rewritten as a single JOIN instead of correlated subquery
      db.execute(sql`
        select coalesce(count(*)::int, 0) as total
        from chat_messages cm
        join chat_channel_members mem
          on mem.channel_id = cm.channel_id
        where mem.user_id = ${me.id}
          and cm.created_at > coalesce(mem.last_read_at, '1970-01-01'::timestamptz)
          and cm.sender_id <> ${me.id}
      `),
    ]);

    const unread = unreadRow[0]?.n ?? 0;
    const chatUnread = Number((chatRow as unknown as Array<any>)[0]?.total) || 0;

    return NextResponse.json({ unread, chatUnread }, {
      headers: { "Cache-Control": "private, max-age=30" },
    });
  } catch {
    return NextResponse.json({ unread: 0, chatUnread: 0 });
  }
}
