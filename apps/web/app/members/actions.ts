"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, users, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { log } from "@/lib/log";

const ROLES = ["admin", "manager", "member", "viewer", "agent"] as const;
type Role = (typeof ROLES)[number];

function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}

/**
 * createMember — pre-SSO manual capture so we can assign tasks to real
 * people. Once Google SSO lands, new sign-ins will auto-provision via the
 * `googleSubject` claim and this form becomes the back-up only.
 */
export async function createMember(formData: FormData): Promise<void> {
  const name = ((formData.get("name") as string) ?? "").trim();
  const email = ((formData.get("email") as string) ?? "").trim().toLowerCase();
  const roleRaw = ((formData.get("role") as string) ?? "member").trim();

  if (!name) throw new Error("name is required");
  if (!email) throw new Error("email is required");
  if (!email.includes("@")) throw new Error("email looks invalid");
  const role: Role = isRole(roleRaw) ? roleRaw : "member";

  const db = getDb();
  const [created] = await db
    .insert(users)
    .values({ name, email, role })
    .returning({ id: users.id });

  if (!created) throw new Error("insert returned no row");
  log.info("member.created", { id: created.id, email, role });
  revalidatePath("/members");
  redirect("/members");
}

/**
 * updateMemberRole — only admins can change roles.
 * Prevents demoting yourself out of admin.
 */
export async function updateMemberRole(formData: FormData): Promise<void> {
  const memberId = ((formData.get("memberId") as string) ?? "").trim();
  const roleRaw = ((formData.get("role") as string) ?? "").trim();
  if (!memberId) throw new Error("memberId is required");
  if (!isRole(roleRaw)) throw new Error("invalid role");

  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("only admins can change roles");
  if (me.id === memberId && roleRaw !== "admin") {
    throw new Error("you cannot demote yourself — ask another admin");
  }

  const db = getDb();
  await db.update(users).set({ role: roleRaw, updatedAt: new Date() }).where(eq(users.id, memberId));
  log.info("member.role_changed", { memberId, newRole: roleRaw, by: me.email });
  revalidatePath("/members");
}

/**
 * toggleMemberActive — deactivate/reactivate a member. Admin only.
 */
export async function toggleMemberActive(formData: FormData): Promise<void> {
  const memberId = ((formData.get("memberId") as string) ?? "").trim();
  if (!memberId) throw new Error("memberId is required");

  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("only admins can change member status");
  if (me.id === memberId) throw new Error("you cannot deactivate yourself");

  const db = getDb();
  const [member] = await db.select({ isActive: users.isActive }).from(users).where(eq(users.id, memberId)).limit(1);
  if (!member) throw new Error("member not found");

  await db.update(users).set({ isActive: !member.isActive, updatedAt: new Date() }).where(eq(users.id, memberId));
  log.info("member.active_toggled", { memberId, isActive: !member.isActive, by: me.email });
  revalidatePath("/members");
}
