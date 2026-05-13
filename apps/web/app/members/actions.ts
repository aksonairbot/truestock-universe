"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, users, departments, eq } from "@tu/db";
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
  const departmentId = ((formData.get("departmentId") as string) ?? "").trim() || null;
  const managerId = ((formData.get("managerId") as string) ?? "").trim() || null;

  if (!name) throw new Error("name is required");
  if (!email) throw new Error("email is required");
  if (!email.includes("@")) throw new Error("email looks invalid");
  const role: Role = isRole(roleRaw) ? roleRaw : "member";

  const db = getDb();
  const [created] = await db
    .insert(users)
    .values({ name, email, role, departmentId, managerId })
    .returning({ id: users.id });

  if (!created) throw new Error("insert returned no row");
  log.info("member.created", { id: created.id, email, role, departmentId, managerId });
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

// ---------------------------------------------------------------------------
// updateMemberDepartment — assign a user to a department (admin only)
// ---------------------------------------------------------------------------
export async function updateMemberDepartment(formData: FormData): Promise<void> {
  const memberId = ((formData.get("memberId") as string) ?? "").trim();
  const departmentId = ((formData.get("departmentId") as string) ?? "").trim() || null;
  if (!memberId) throw new Error("memberId is required");

  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("only admins can change departments");

  const db = getDb();
  await db.update(users).set({ departmentId, updatedAt: new Date() }).where(eq(users.id, memberId));
  log.info("member.department_changed", { memberId, departmentId, by: me.email });
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
}

// ---------------------------------------------------------------------------
// updateMemberManager — assign a reporting manager to a user (admin only)
// ---------------------------------------------------------------------------
export async function updateMemberManager(formData: FormData): Promise<void> {
  const memberId = ((formData.get("memberId") as string) ?? "").trim();
  const managerId = ((formData.get("managerId") as string) ?? "").trim() || null;
  if (!memberId) throw new Error("memberId is required");
  if (managerId === memberId) throw new Error("a user cannot be their own manager");

  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("only admins can change managers");

  const db = getDb();
  await db.update(users).set({ managerId, updatedAt: new Date() }).where(eq(users.id, memberId));
  log.info("member.manager_changed", { memberId, managerId, by: me.email });
  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
}

// ---------------------------------------------------------------------------
// Department CRUD — admin only
// ---------------------------------------------------------------------------
export async function createDepartment(formData: FormData): Promise<void> {
  const name = ((formData.get("name") as string) ?? "").trim();
  const color = ((formData.get("color") as string) ?? "").trim() || null;
  const headId = ((formData.get("headId") as string) ?? "").trim() || null;
  if (!name) throw new Error("department name is required");

  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("only admins can create departments");

  const db = getDb();
  await db.insert(departments).values({ name, color, headId });
  log.info("department.created", { name, by: me.email });
  revalidatePath("/members");
}

export async function updateDepartment(formData: FormData): Promise<void> {
  const departmentId = ((formData.get("departmentId") as string) ?? "").trim();
  const name = ((formData.get("name") as string) ?? "").trim();
  const color = ((formData.get("color") as string) ?? "").trim() || null;
  const headId = ((formData.get("headId") as string) ?? "").trim() || null;
  if (!departmentId) throw new Error("departmentId is required");
  if (!name) throw new Error("department name is required");

  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("only admins can edit departments");

  const db = getDb();
  await db.update(departments).set({ name, color, headId, updatedAt: new Date() }).where(eq(departments.id, departmentId));
  log.info("department.updated", { departmentId, name, by: me.email });
  revalidatePath("/members");
}

export async function deleteDepartment(formData: FormData): Promise<void> {
  const departmentId = ((formData.get("departmentId") as string) ?? "").trim();
  if (!departmentId) throw new Error("departmentId is required");

  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("only admins can delete departments");

  const db = getDb();
  // Clear departmentId from any users in this department first
  await db.update(users).set({ departmentId: null, updatedAt: new Date() }).where(eq(users.departmentId, departmentId));
  await db.delete(departments).where(eq(departments.id, departmentId));
  log.info("department.deleted", { departmentId, by: me.email });
  revalidatePath("/members");
}
