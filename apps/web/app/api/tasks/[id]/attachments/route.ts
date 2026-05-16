// apps/web/app/api/tasks/[id]/attachments/route.ts
//
// POST — upload file(s) to a task (max 3 attachments total, 10 MB each)
// GET  — list attachments for a task

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, taskAttachments, tasks, eq, sql } from "@tu/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS_PER_TASK = 3;
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/opt/truestock-universe/uploads";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
    if (!UUID_RE.test(taskId)) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    await getCurrentUser(); // auth gate
    const db = getDb();

    const rows = await db
      .select({
        id: taskAttachments.id,
        filename: taskAttachments.filename,
        mime: taskAttachments.mime,
        sizeBytes: taskAttachments.sizeBytes,
        createdAt: taskAttachments.createdAt,
      })
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(taskAttachments.createdAt);

    return NextResponse.json({
      attachments: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        mime: r.mime,
        sizeBytes: Number(r.sizeBytes),
        createdAt: r.createdAt,
        url: `/api/attachments/${r.id}`,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
    if (!UUID_RE.test(taskId)) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
    const me = await getCurrentUser();
    const db = getDb();

    // Verify task exists
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Check current attachment count
    const [countRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId));
    const existing = countRow?.n ?? 0;

    if (existing >= MAX_ATTACHMENTS_PER_TASK) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ATTACHMENTS_PER_TASK} attachments per task reached.` },
        { status: 400 },
      );
    }

    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // How many can we still accept?
    const slotsLeft = MAX_ATTACHMENTS_PER_TASK - existing;
    const toProcess = files.slice(0, slotsLeft);

    const results: Array<{
      id: string;
      filename: string;
      mime: string | null;
      sizeBytes: number;
      url: string;
    }> = [];

    // Ensure uploads dir exists
    const taskDir = join(UPLOADS_DIR, taskId);
    await mkdir(taskDir, { recursive: true });

    for (const file of toProcess) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 10 MB limit.` },
          { status: 400 },
        );
      }

      const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
      const storedName = `${randomUUID()}${ext}`;
      const spacesKey = `${taskId}/${storedName}`;
      const filePath = join(UPLOADS_DIR, spacesKey);

      // Write to disk
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      // Insert DB row
      const [row] = await db
        .insert(taskAttachments)
        .values({
          taskId,
          uploaderId: me.id,
          filename: file.name,
          mime: file.type || null,
          sizeBytes: BigInt(file.size),
          spacesKey,
        })
        .returning({ id: taskAttachments.id });

      if (!row) continue;

      results.push({
        id: row.id,
        filename: file.name,
        mime: file.type || null,
        sizeBytes: file.size,
        url: `/api/attachments/${row.id}`,
      });
    }

    const skipped = files.length - toProcess.length;

    return NextResponse.json({
      attachments: results,
      ...(skipped > 0 ? { warning: `${skipped} file(s) skipped — max ${MAX_ATTACHMENTS_PER_TASK} attachments per task.` } : {}),
    });
  } catch (e: any) {
    console.error("[UPLOAD ERROR]", e);
    return NextResponse.json({ error: e.message ?? "Upload failed" }, { status: 500 });
  }
}
