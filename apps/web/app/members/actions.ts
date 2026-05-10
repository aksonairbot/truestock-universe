"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, users } from "@tu/db";
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
