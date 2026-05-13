"use server";

import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getDb, projects, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";

const BANNERS_DIR = join(process.cwd(), "public", "banners");

/** Upload a custom banner image for a project */
export async function uploadProjectBanner(formData: FormData) {
  await getCurrentUser(); // auth guard

  const file = formData.get("file") as File | null;
  const slug = formData.get("slug") as string;
  if (!file || !slug) throw new Error("file and slug are required");

  // Validate file type
  const allowed = ["image/webp", "image/png", "image/jpeg"];
  if (!allowed.includes(file.type)) throw new Error("Only webp, png, or jpeg allowed");

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) throw new Error("File too large (max 5MB)");

  const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
  const filename = `${slug}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(BANNERS_DIR, { recursive: true });
  await writeFile(join(BANNERS_DIR, filename), buffer);

  const bannerUrl = `/banners/${filename}`;
  const db = getDb();
  await db.update(projects).set({ bannerUrl }).where(eq(projects.slug, slug));

  revalidatePath(`/projects/${slug}`);
  revalidatePath("/projects");
}

/** Assign one of the placeholder cosmic banners to a project */
export async function assignPlaceholderBanner(slug: string, bannerUrl: string) {
  await getCurrentUser(); // auth guard

  // Validate it's a real placeholder path
  if (!bannerUrl.startsWith("/banners/cosmic-") && !bannerUrl.startsWith("/banners/")) {
    throw new Error("Invalid banner path");
  }

  const db = getDb();
  await db.update(projects).set({ bannerUrl }).where(eq(projects.slug, slug));

  revalidatePath(`/projects/${slug}`);
  revalidatePath("/projects");
}
