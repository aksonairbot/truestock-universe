"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getDb,
  users,
  reviewCycles,
  reviewQuestions,
  reviewResponses,
  eq,
  and,
  sql,
} from "@tu/db";
import { getCurrentUser } from "@/lib/auth";
import { log } from "@/lib/log";

// ─── Default questions for a yearly review ──────────────────────────
// 3 sections × 2 questions + 1 self-rating = 6 questions total
const DEFAULT_QUESTIONS: { text: string; help: string; section: string; type: "text" | "rating" }[] = [
  // ── Achievements & Performance Summary ──
  {
    section: "Achievements & Performance Summary",
    type: "text",
    text: "Could you provide a comprehensive summary of the key deliverables completed during the last financial year?",
    help: "Cover projects delivered, targets met, volume handled, and any measurable impact on the team or organisation.",
  },
  {
    section: "Achievements & Performance Summary",
    type: "text",
    text: "In which specific projects or strategic areas did you achieve the most significant success?",
    help: "Highlight your strongest contributions — where did you exceed expectations or drive standout results?",
  },
  // ── Critical Analysis & Development Areas ──
  {
    section: "Critical Analysis & Development Areas",
    type: "text",
    text: "What were the primary challenges encountered, and which areas fell short of initial expectations?",
    help: "Be candid — reflect on missed targets, resource constraints, or gaps in execution. Honest analysis drives growth.",
  },
  {
    section: "Critical Analysis & Development Areas",
    type: "text",
    text: "What critical insights and operational lessons were gained from managing those challenges?",
    help: "What changed in how you work? New frameworks, processes, skills, or mindset shifts you picked up.",
  },
  // ── Forward Planning & Self-Evaluation ──
  {
    section: "Forward Planning & Self-Evaluation",
    type: "text",
    text: "What are the core strategic priorities, targets, and execution plans established for the upcoming financial year?",
    help: "Outline your roadmap — key goals, milestones, and how you intend to achieve them.",
  },
  {
    section: "Forward Planning & Self-Evaluation",
    type: "rating",
    text: "How would you objectively rate your overall performance this past year on a scale of 1 to 10?",
    help: "1 = significant underperformance, 5 = met basic expectations, 10 = exceptional across all areas. Briefly justify your rating.",
  },
];

// ─── Create a new review cycle (admin only) ─────────────────────────
export async function createReviewCycle(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("Only admins can create review cycles.");

  const name = ((formData.get("name") as string) ?? "").trim();
  const fyStart = ((formData.get("fyStart") as string) ?? "").trim();
  const fyEnd = ((formData.get("fyEnd") as string) ?? "").trim();
  const deadlineRaw = ((formData.get("deadline") as string) ?? "").trim();

  if (!name) throw new Error("Name is required.");
  if (!fyStart || !fyEnd) throw new Error("FY start and end dates are required.");

  const db = getDb();

  // Create cycle + seed questions in a single transaction for consistency
  const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
  if (deadline && isNaN(deadline.getTime())) throw new Error("Invalid deadline date.");

  const [cycle] = await db
    .insert(reviewCycles)
    .values({
      name,
      fyStart,
      fyEnd,
      deadline,
      status: "draft",
      createdById: me.id,
    })
    .returning({ id: reviewCycles.id });

  if (!cycle) throw new Error("Failed to create review cycle.");

  // Seed the default questions in a single batch insert
  await db.insert(reviewQuestions).values(
    DEFAULT_QUESTIONS.map((q, i) => ({
      cycleId: cycle.id,
      orderIndex: i,
      questionText: q.text,
      helpText: `${q.section}§§${q.type}§§${q.help}`,
    })),
  );

  log.info("review.cycle_created", { cycleId: cycle.id, name, by: me.email });
  revalidatePath("/reviews");
  redirect(`/reviews/${cycle.id}`);
}

// ─── Open a cycle → create pending responses for all active members ─
export async function openReviewCycle(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("Only admins can open review cycles.");

  const cycleId = ((formData.get("cycleId") as string) ?? "").trim();
  if (!cycleId) throw new Error("cycleId is required.");

  const db = getDb();

  // Mark cycle as open
  await db
    .update(reviewCycles)
    .set({ status: "open", updatedAt: new Date() })
    .where(eq(reviewCycles.id, cycleId));

  // Create a pending response for every active member (not viewers/agents)
  const activeMembers = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.isActive, true),
        sql`${users.role} IN ('admin', 'manager', 'member')`,
      ),
    );

  if (activeMembers.length > 0) {
    await db
      .insert(reviewResponses)
      .values(activeMembers.map((m) => ({ cycleId, userId: m.id, status: "pending" as const })))
      .onConflictDoNothing();
  }

  log.info("review.cycle_opened", { cycleId, memberCount: activeMembers.length, by: me.email });
  revalidatePath("/reviews");
  revalidatePath(`/reviews/${cycleId}`);
}

// ─── Close a cycle ──────────────────────────────────────────────────
export async function closeReviewCycle(formData: FormData): Promise<void> {
  const me = await getCurrentUser();
  if (me.role !== "admin") throw new Error("Only admins can close review cycles.");

  const cycleId = ((formData.get("cycleId") as string) ?? "").trim();
  if (!cycleId) throw new Error("cycleId is required.");

  const db = getDb();
  await db
    .update(reviewCycles)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(reviewCycles.id, cycleId));

  log.info("review.cycle_closed", { cycleId, by: me.email });
  revalidatePath("/reviews");
  revalidatePath(`/reviews/${cycleId}`);
}

// ─── Save / submit a response (member fills their form) ─────────────
export async function saveReviewResponse(formData: FormData): Promise<void> {
  const me = await getCurrentUser();

  const responseId = ((formData.get("responseId") as string) ?? "").trim();
  const action = ((formData.get("action") as string) ?? "save").trim(); // "save" or "submit"

  if (!responseId) throw new Error("responseId is required.");

  const db = getDb();

  // Fetch the response row and ensure it belongs to this user
  const [resp] = await db
    .select()
    .from(reviewResponses)
    .where(eq(reviewResponses.id, responseId))
    .limit(1);

  if (!resp) throw new Error("Review response not found.");
  if (resp.userId !== me.id) throw new Error("This review does not belong to you.");
  if (resp.status === "submitted") throw new Error("Already submitted — cannot edit.");

  // Check cycle is still open
  const [cycle] = await db
    .select({ status: reviewCycles.status })
    .from(reviewCycles)
    .where(eq(reviewCycles.id, resp.cycleId))
    .limit(1);
  if (!cycle || cycle.status !== "open") throw new Error("This review cycle is no longer open.");

  // Collect answers from formData
  // Text questions: "q_<id>" → answer
  // Rating questions: "q_<id>_rating" + "q_<id>_justification" → combined as "rating|justification"
  const answers: Record<string, string> = {};
  const ratings: Record<string, string> = {};
  const justifications: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key.endsWith("_rating")) {
      const qId = key.replace("q_", "").replace("_rating", "");
      ratings[qId] = value.trim();
    } else if (key.endsWith("_justification")) {
      const qId = key.replace("q_", "").replace("_justification", "");
      justifications[qId] = value.trim();
    } else if (key.startsWith("q_")) {
      answers[key.replace("q_", "")] = value.trim();
    }
  }

  // Merge rating + justification into a single "rating|justification" string
  for (const qId of Object.keys(ratings)) {
    answers[qId] = `${ratings[qId]}|${justifications[qId] ?? ""}`;
  }

  const isSubmit = action === "submit";

  await db
    .update(reviewResponses)
    .set({
      answers,
      status: isSubmit ? "submitted" : "in_progress",
      submittedAt: isSubmit ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(reviewResponses.id, responseId));

  log.info(isSubmit ? "review.submitted" : "review.saved", {
    responseId,
    userId: me.id,
    cycleId: resp.cycleId,
  });

  revalidatePath("/reviews");
  revalidatePath(`/reviews/${resp.cycleId}`);

  if (isSubmit) {
    redirect(`/reviews/${resp.cycleId}`);
  }
}
