// apps/web/app/chat/actions.ts
//
// Server actions for chat: channels, messages, DMs.

"use server";

import {
  getDb,
  chatChannels,
  chatChannelMembers,
  chatMessages,
  users,
  eq,
  and,
  desc,
  asc,
  sql,
} from "@tu/db";
import { getCurrentUserId } from "@/lib/auth";

// ---------- channels ----------

export interface ChannelRow {
  id: string;
  name: string | null;
  type: "dm" | "group";
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderName: string | null;
  unread: number;
  memberNames: string[];
}

export async function getMyChannels(): Promise<ChannelRow[]> {
  const userId = await getCurrentUserId();
  const db = getDb();

  const rows = await db.execute(sql`
    select
      c.id, c.name, c.type,
      lm.body as last_message,
      lm.created_at as last_message_at,
      lu.name as last_sender_name,
      coalesce((
        select count(*)::int from chat_messages cm
        where cm.channel_id = c.id
          and cm.created_at > coalesce(mem.last_read_at, '1970-01-01')
          and cm.sender_id <> ${userId}
      ), 0) as unread,
      (
        select array_agg(u2.name order by u2.name)
        from chat_channel_members m2
        join users u2 on u2.id = m2.user_id
        where m2.channel_id = c.id and m2.user_id <> ${userId}
      ) as member_names
    from chat_channels c
    join chat_channel_members mem on mem.channel_id = c.id and mem.user_id = ${userId}
    left join lateral (
      select cm.body, cm.created_at, cm.sender_id
      from chat_messages cm where cm.channel_id = c.id
      order by cm.created_at desc limit 1
    ) lm on true
    left join users lu on lu.id = lm.sender_id
    order by coalesce(lm.created_at, c.created_at) desc
  `);

  return (rows as unknown as Array<any>).map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    lastMessage: r.last_message,
    lastMessageAt: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
    lastSenderName: r.last_sender_name,
    unread: Number(r.unread) || 0,
    memberNames: r.member_names ?? [],
  }));
}

// ---------- messages ----------

export interface MessageRow {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export async function getMessages(channelId: string, before?: string): Promise<MessageRow[]> {
  const db = getDb();
  const limit = 50;

  const rows = await db.execute(sql`
    select m.id, m.channel_id, m.sender_id, u.name as sender_name, m.body, m.created_at
    from chat_messages m
    join users u on u.id = m.sender_id
    where m.channel_id = ${channelId}
      ${before ? sql`and m.created_at < ${before}` : sql``}
    order by m.created_at desc
    limit ${limit}
  `);

  return (rows as unknown as Array<any>).map((r) => ({
    id: r.id,
    channelId: r.channel_id,
    senderId: r.sender_id,
    senderName: r.sender_name,
    body: r.body,
    createdAt: new Date(r.created_at).toISOString(),
  })).reverse(); // oldest first for display
}

// ---------- send message ----------

export async function sendMessage(channelId: string, body: string): Promise<MessageRow> {
  const userId = await getCurrentUserId();
  const db = getDb();

  const rows = await db
    .insert(chatMessages)
    .values({ channelId, senderId: userId, body: body.trim() })
    .returning();
  const msg = rows[0]!;

  // Update last_read_at for sender
  await db
    .update(chatChannelMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)));

  // Get sender name
  const senderRows = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);

  return {
    id: msg.id,
    channelId: msg.channelId,
    senderId: msg.senderId,
    senderName: senderRows[0]?.name ?? "Unknown",
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
  };
}

// ---------- mark read ----------

export async function markChannelRead(channelId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const db = getDb();
  await db
    .update(chatChannelMembers)
    .set({ lastReadAt: new Date() })
    .where(and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId)));
}

// ---------- create group channel ----------

export async function createGroupChannel(name: string, memberIds: string[]): Promise<{ id: string }> {
  const userId = await getCurrentUserId();
  const db = getDb();

  const chRows = await db
    .insert(chatChannels)
    .values({ name, type: "group", createdById: userId })
    .returning();
  const channel = chRows[0]!;

  // Add creator + members
  const allMembers = new Set([userId, ...memberIds]);
  for (const mid of allMembers) {
    await db.insert(chatChannelMembers).values({ channelId: channel.id, userId: mid }).onConflictDoNothing();
  }

  return { id: channel.id };
}

// ---------- get or create DM ----------

export async function getOrCreateDM(otherUserId: string): Promise<{ id: string }> {
  const userId = await getCurrentUserId();
  const db = getDb();

  // Check if DM already exists between these two users
  const existing = await db.execute(sql`
    select c.id from chat_channels c
    where c.type = 'dm'
      and exists (select 1 from chat_channel_members m1 where m1.channel_id = c.id and m1.user_id = ${userId})
      and exists (select 1 from chat_channel_members m2 where m2.channel_id = c.id and m2.user_id = ${otherUserId})
      and (select count(*) from chat_channel_members m3 where m3.channel_id = c.id) = 2
    limit 1
  `);

  const existingRow = (existing as unknown as Array<{ id: string }>)[0];
  if (existingRow) return { id: existingRow.id };

  // Create new DM
  const dmRows = await db
    .insert(chatChannels)
    .values({ type: "dm", createdById: userId })
    .returning();
  const channel = dmRows[0]!;

  await db.insert(chatChannelMembers).values([
    { channelId: channel.id, userId },
    { channelId: channel.id, userId: otherUserId },
  ]);

  return { id: channel.id };
}

// ---------- list users for new DM/group ----------

export interface ChatUser {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  lastActivity: string | null;       // ISO timestamp
  lastActivityLabel: string | null;   // e.g. "Completed: Fix header bug"
}

export async function getChatUsers(): Promise<ChatUser[]> {
  const userId = await getCurrentUserId();
  const db = getDb();

  const rows = await db.execute(sql`
    select
      u.id, u.name, u.role, u.avatar_url,
      greatest(
        (select max(t.updated_at) from tasks t where t.assignee_id = u.id),
        (select max(c.created_at) from comments c where c.author_id = u.id),
        (select max(cm.created_at) from chat_messages cm where cm.sender_id = u.id)
      ) as last_activity,
      (
        select t.title from tasks t
        where t.assignee_id = u.id
        order by t.updated_at desc limit 1
      ) as last_task_title,
      (
        select t.status from tasks t
        where t.assignee_id = u.id
        order by t.updated_at desc limit 1
      ) as last_task_status
    from users u
    where u.is_active = true and u.id <> ${userId}
    order by last_activity desc nulls last, u.name asc
  `);

  return (rows as unknown as Array<any>).map((r) => {
    let label: string | null = null;
    if (r.last_task_title) {
      const verb = r.last_task_status === "done" ? "Completed" : "Working on";
      label = `${verb}: ${r.last_task_title}`;
      if (label.length > 50) label = label.slice(0, 47) + "...";
    }
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      avatarUrl: r.avatar_url,
      lastActivity: r.last_activity ? new Date(r.last_activity).toISOString() : null,
      lastActivityLabel: label,
    };
  });
}
