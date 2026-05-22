"use server";

import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { getDb, projects, eq } from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isPrivileged } from "@/lib/access";

const BANNERS_DIR = join(process.cwd(), "public", "banners");
const ICONS_DIR = join(process.cwd(), "public", "icons");

// Project slugs are lowercase-alnum + hyphen. The same regex used by
// createProject. Used here to reject path-traversal payloads — without
// this, a caller can send `slug = "../../../etc/foo"` and write under
// `public/` outside the banners/icons folders. We additionally verify
// the slug refers to an existing project before writing.
const SLUG_RE = /^[a-z0-9-]{1,50}$/;

async function loadProjectBySlug(slug: string) {
  if (!SLUG_RE.test(slug)) throw new Error("invalid project slug");
  const db = getDb();
  const [proj] = await db
    .select({ id: projects.id, ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!proj) throw new Error("project not found");
  return proj;
}

/** Upload a custom banner image for a project. Admin or project owner. */
export async function uploadProjectBanner(formData: FormData) {
  const me = await getCurrentUser();
  const file = formData.get("file") as File | null;
  const slug = formData.get("slug") as string;
  if (!file || !slug) throw new Error("file and slug are required");

  const proj = await loadProjectBySlug(slug);
  if (!isPrivileged(me) && proj.ownerId !== me.id) {
    throw new Error("Only the project owner, manager, or admin can change the banner.");
  }

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

/** Upload a project icon (square logo). Admin only.
 *  SVG is rejected — even with a sane filename, served SVGs can carry
 *  inline <script> and would execute in the SeekPeak origin. */
export async function uploadProjectIcon(formData: FormData) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) throw new Error("only admins can upload icons");

  const file = formData.get("file") as File | null;
  const slug = formData.get("slug") as string;
  if (!file || !slug) throw new Error("file and slug are required");

  await loadProjectBySlug(slug);

  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) throw new Error("Only png, jpeg, or webp allowed");
  if (file.size > 2 * 1024 * 1024) throw new Error("File too large (max 2MB)");

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const filename = `${slug}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await mkdir(ICONS_DIR, { recursive: true });
  await writeFile(join(ICONS_DIR, filename), buffer);

  const iconUrl = `/icons/${filename}`;
  const db = getDb();
  await db.update(projects).set({ iconUrl }).where(eq(projects.slug, slug));

  revalidatePath(`/projects/${slug}`);
  revalidatePath("/projects");
  revalidatePath("/tasks");
  revalidatePath("/");
}

// Whitelist of placeholder banner basenames committed to public/banners/.
// Keeps assignPlaceholderBanner from accepting arbitrary `/banners/*` paths.
const PLACEHOLDER_BANNERS = new Set([
  "cosmic-andromeda.webp",
  "cosmic-helix-dome.webp",
  "cosmic-m78-port.webp",
  "cosmic-orion-deck.webp",
  "cosmic-perseus-nebula.webp",
  "cosmic-perseus-ridge.webp",
  "cosmic-vega-dome.webp",
  "cosmic-vela-bay.webp",
]);

/** Assign one of the placeholder cosmic banners to a project. Admin/manager/owner. */
export async function assignPlaceholderBanner(slug: string, bannerUrl: string) {
  const me = await getCurrentUser();
  const proj = await loadProjectBySlug(slug);
  if (!isPrivileged(me) && proj.ownerId !== me.id) {
    throw new Error("Only the project owner, manager, or admin can change the banner.");
  }

  const PREFIX = "/banners/";
  if (!bannerUrl.startsWith(PREFIX)) throw new Error("Invalid banner path");
  const base = bannerUrl.slice(PREFIX.length);
  if (!PLACEHOLDER_BANNERS.has(base)) {
    throw new Error("Unknown placeholder banner");
  }

  const db = getDb();
  await db.update(projects).set({ bannerUrl }).where(eq(projects.slug, slug));

  revalidatePath(`/projects/${slug}`);
  revalidatePath("/projects");
}
