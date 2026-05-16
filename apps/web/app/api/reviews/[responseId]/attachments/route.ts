// apps/web/app/api/reviews/[responseId]/attachments/route.ts
//
// POST — upload file(s) to a review response (max 3, 10 MB each, PDFs + presentations)
// GET  — list attachments for a review response

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, reviewAttachments, reviewResponses, eq, sql } from "@tu/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS = 3;
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/opt/truestock-universe/uploads";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx", "png", "jpg", "jpeg", "webp",
]);

function isAllowed(file: File): boolean {
  if (ALLOWED_MIMES.has(file.type)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.has(ext);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ responseId: string }> },
) {
  try {
    const { responseId } = await params;
    if (!UUID_RE.test(responseId)) {
      return NextResponse.json({ error: "Invalid response ID" }, { status: 400 });
    }
    await getCurrentUser();
    const db = getDb();

    const rows = await db
      .select({
        id: reviewAttachments.id,
        filename: reviewAttachments.filename,
        mime: reviewAttachments.mime,
        sizeBytes: reviewAttachments.sizeBytes,
        createdAt: reviewAttachments.createdAt,
      })
      .from(reviewAttachments)
      .where(eq(reviewAttachments.responseId, responseId))
      .orderBy(reviewAttachments.createdAt);

    return NextResponse.json({
      attachments: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        mime: r.mime,
        sizeBytes: Number(r.sizeBytes),
        createdAt: r.createdAt,
        url: `/api/attachments/${r.id}?type=review`,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ responseId: string }> },
) {
  try {
    const { responseId } = await params;
    if (!UUID_RE.test(responseId)) {
      return NextResponse.json({ error: "Invalid response ID" }, { status: 400 });
    }
    const me = await getCurrentUser();
    const db = getDb();

    // Verify response exists and belongs to user
    const [resp] = await db
      .select({ id: reviewResponses.id, userId: reviewResponses.userId, status: reviewResponses.status })
      .from(reviewResponses)
      .where(eq(reviewResponses.id, responseId))
      .limit(1);

    if (!resp) {
      return NextResponse.json({ error: "Review response not found" }, { status: 404 });
    }
    if (resp.userId !== me.id) {
      return NextResponse.json({ error: "Not your review" }, { status: 403 });
    }
    if (resp.status === "submitted") {
      return NextResponse.json({ error: "Cannot attach files to a submitted review" }, { status: 400 });
    }

    // Check count
    const [countRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviewAttachments)
      .where(eq(reviewAttachments.responseId, responseId));
    const existing = countRow?.n ?? 0;

    if (existing >= MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ATTACHMENTS} attachments per review.` },
        { status: 400 },
      );
    }

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const slotsLeft = MAX_ATTACHMENTS - existing;
    const toProcess = files.slice(0, slotsLeft);

    const results: Array<{
      id: string;
      filename: string;
      mime: string | null;
      sizeBytes: number;
      url: string;
    }> = [];

    const dir = join(UPLOADS_DIR, "reviews", responseId);
    await mkdir(dir, { recursive: true });

    for (const file of toProcess) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 10 MB limit.` },
          { status: 400 },
        );
      }
      if (!isAllowed(file)) {
        return NextResponse.json(
          { error: `File "${file.name}" is not an allowed type. Upload PDFs, presentations, documents, or images.` },
          { status: 400 },
        );
      }

      const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
      const storedName = `${randomUUID()}${ext}`;
      const spacesKey = `reviews/${responseId}/${storedName}`;
      const filePath = join(UPLOADS_DIR, spacesKey);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      const [row] = await db
        .insert(reviewAttachments)
        .values({
          responseId,
          uploaderId: me.id,
          filename: file.name,
          mime: file.type || null,
          sizeBytes: BigInt(file.size),
          spacesKey,
        })
        .returning({ id: reviewAttachments.id });

      if (!row) continue;

      results.push({
        id: row.id,
        filename: file.name,
        mime: file.type || null,
        sizeBytes: file.size,
        url: `/api/attachments/${row.id}?type=review`,
      });
    }

    const skipped = files.length - toProcess.length;

    return NextResponse.json({
      attachments: results,
      ...(skipped > 0 ? { warning: `${skipped} file(s) skipped — max ${MAX_ATTACHMENTS} per review.` } : {}),
    });
  } catch (e: any) {
    console.error("[REVIEW UPLOAD ERROR]", e);
    return NextResponse.json({ error: e.message ?? "Upload failed" }, { status: 500 });
  }
}
