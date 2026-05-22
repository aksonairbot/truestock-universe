// apps/web/app/api/attachments/[id]/route.ts
//
// GET — serve an attachment file by its DB id.
// Supports both task attachments and review attachments via ?type=review query param.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, taskAttachments, reviewAttachments, eq } from "@tu/db";
import { readFile, stat } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";

const UPLOADS_DIR = process.env.UPLOADS_DIR || "/opt/truestock-universe/uploads";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeFilename(name: string): string {
  return name.replace(/["\n\r\\]/g, "_").slice(0, 255);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid attachment ID" }, { status: 400 });
    }
    await getCurrentUser(); // auth gate

    const isReview = req.nextUrl.searchParams.get("type") === "review";
    const db = getDb();

    let attachment: { filename: string; mime: string | null; spacesKey: string } | undefined;

    if (isReview) {
      const [row] = await db
        .select({
          filename: reviewAttachments.filename,
          mime: reviewAttachments.mime,
          spacesKey: reviewAttachments.spacesKey,
        })
        .from(reviewAttachments)
        .where(eq(reviewAttachments.id, id))
        .limit(1);
      attachment = row;
    } else {
      const [row] = await db
        .select({
          filename: taskAttachments.filename,
          mime: taskAttachments.mime,
          spacesKey: taskAttachments.spacesKey,
        })
        .from(taskAttachments)
        .where(eq(taskAttachments.id, id))
        .limit(1);
      attachment = row;
    }

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Prevent path traversal via spacesKey
    if (attachment.spacesKey.includes("..")) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const filePath = join(UPLOADS_DIR, attachment.spacesKey);

    // Check file exists
    try {
      await stat(filePath);
    } catch {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }

    const buffer = await readFile(filePath);
    const storedType = attachment.mime || "application/octet-stream";

    // SVGs can carry inline <script> and would execute in the SeekPeak
    // origin if served as image/svg+xml. Force a download in that case.
    // text/html and anything ambiguous also gets `attachment` disposition.
    const safeForInline =
      storedType.startsWith("image/") && storedType !== "image/svg+xml";
    const isPdf = storedType === "application/pdf";
    const isInline = safeForInline || isPdf;

    // Re-write Content-Type for anything we won't render inline. Stops
    // attacker-uploaded "text/html" from being treated as a renderable
    // document; the browser sees octet-stream + attachment disposition.
    const contentType = isInline ? storedType : "application/octet-stream";

    const safeName = sanitizeFilename(attachment.filename);
    const disposition = isInline
      ? `inline; filename="${safeName}"`
      : `attachment; filename="${safeName}"`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=86400",
        // Belt-and-braces against MIME sniffing.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}
