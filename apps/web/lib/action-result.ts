// apps/web/lib/action-result.ts
//
// The shape every user-facing server action returns.
//
// WHY THIS EXISTS: Next.js redacts thrown server-action messages in
// production. A `throw new Error("Instagram needs an image attached")` reaches
// the person as "Something went wrong. An unexpected error occurred." So the
// app had a whole vocabulary of precise, actionable messages that NO USER
// COULD EVER SEE — see feedback_server_action_errors_are_redacted.
//
// The rule: anything the person must ACT on travels back as a VALUE.
// Genuine faults — a forged id, someone else's record — still throw, because
// those aren't conversations and redaction is correct for them.

export type ActionResult = { ok: true } | { ok: false; error: string };

export const ok: ActionResult = { ok: true };

export function fail(error: string): ActionResult {
  return { ok: false, error };
}
