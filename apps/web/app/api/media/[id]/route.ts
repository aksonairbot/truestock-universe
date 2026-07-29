// apps/web/app/api/media/[id]/route.ts
//
// PUBLIC, signature-gated read of a task attachment.
//
// This is the ONE route in the app that serves a file without a session, and
// it exists for exactly one reason: Upload-post fetches media by URL from its
// own servers and cannot present our cookie. See lib/media-token.ts.
//
// Guardrails, all of which matter:
//   * HMAC over (id, exp) — no signature, no file. Guessing an id is useless.
//   * Short expiry, checked before any DB or disk work.
//   * IMAGES AND VIDEO ONLY. Even with a valid token this route will not hand
//     out a PDF, a spreadsheet or an SVG (which can carry script). A leaked
//     link can therefore never become a document exfiltration path.
//   * Always Content-Disposition: attachment + nosniff, never inline.

import { NextRequest, NextResponse } from "next/server";
import { getDb, taskAttachments, eq } from "@tu/db";
import { verifyMediaToken } from "@/lib/media-token";
import { log } from "@/lib/log";
import { readFile, stat } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOADS_DIR = process.env.UPLOADS_DIR || "/opt/truestock-universe/uploads";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeFilename(name: string): string {
  return name.replace(/["\n\r\\]/g, "_").slice(0, 255);
}

/** Only media a social network would actually accept. Everything else: 404. */
function isPublishableMime(mime: string | null): boolean {
  if (!mime) return false;
  if (mime === "image/svg+xml") return false; // can carry inline script
  return mime.startsWith("image/") || mime.startsWith("video/");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) return new NextResponse("Not found", { status: 404 });

    const ok = verifyMediaToken(
      id,
      req.nextUrl.searchParams.get("exp"),
      req.nextUrl.searchParams.get("sig"),
    );
    if (!ok) {
      log.warn("media.bad_token", { id });
      // 404 rather than 403: an expired or forged link should not confirm
      // that the attachment exists.
      return new NextResponse("Not found", { status: 404 });
    }

    const db = getDb();
    const [attachment] = await db
      .select({
        filename: taskAttachments.filename,
        mime: taskAttachments.mime,
        spacesKey: taskAttachments.spacesKey,
      })
      .from(taskAttachments)
      .where(eq(taskAttachments.id, id))
      .limit(1);

    if (!attachment) return new NextResponse("Not found", { status: 404 });
    if (!isPublishableMime(attachment.mime)) {
      log.warn("media.non_media_blocked", { id, mime: attachment.mime });
      return new NextResponse("Not found", { status: 404 });
    }
    if (attachment.spacesKey.includes("..")) return new NextResponse("Not found", { status: 404 });

    const filePath = join(UPLOADS_DIR, attachment.spacesKey);
    try {
      await stat(filePath);
    } catch {
      return new NextResponse("Not found", { status: 404 });
    }

    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": attachment.mime!,
        "Content-Disposition": `attachment; filename="${sanitizeFilename(attachment.filename)}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (e) {
    log.error("media.error", { error: (e as Error).message });
    return new NextResponse("Server error", { status: 500 });
  }
}
