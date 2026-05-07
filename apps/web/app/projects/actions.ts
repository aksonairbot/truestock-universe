"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb, projects, products, eq } from "@tu/db";
import { getCurrentUserId } from "@/lib/auth";
import { log } from "@/lib/log";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function createProject(formData: FormData): Promise<void> {
  const name = ((formData.get("name") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim() || null;
  const productSlug = ((formData.get("productSlug") as string) ?? "").trim();
  const colorRaw = ((formData.get("color") as string) ?? "").trim() || null;
  const slugInput = ((formData.get("slug") as string) ?? "").trim();

  if (!name) throw new Error("name is required");
  const slug = slugInput ? slugify(slugInput) : slugify(name);
  if (!slug) throw new Error("slug is required (could not derive from name)");

  const db = getDb();

  // Optional product binding
  let productId: string | null = null;
  if (productSlug) {
    const [p] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, productSlug as never))
      .limit(1);
    if (!p) throw new Error(`product  not found`);
    productId = p.id;
  }

  const ownerId = await getCurrentUserId();
  const color = colorRaw && /^#[0-9a-fA-F]{6}$/.test(colorRaw) ? colorRaw : null;

  await db.insert(projects).values({
    slug,
    name,
    description,
    productId,
    ownerId,
    color,
  });

  log.info("project.created", { slug, name, productSlug });
  revalidatePath("/projects");
  redirect(`/projects/${slug}`);
}
