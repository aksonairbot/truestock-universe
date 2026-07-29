// apps/web/app/tasks/content-approval.tsx
//
// The approval gate for content items (Stage 2).
//
// Rule: nothing reaches Scheduled or Published without a NAMED approver on
// record. The server actions enforce it; this component makes the state
// legible and gives approvers a one-click way to sign off.
//
// The compliance checkbox is a deliberately SEPARATE signal from approval:
//   approval  = "the content is right"
//   compliance = "the disclaimers / registration details are present"
// For a SEBI-regulated business those are two different people's worries even
// when the same person ticks both.

import { approveContent, revokeContentApproval } from "./content-actions";

function fmtIst(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function ContentApproval({
  taskId,
  channel,
  approvedById,
  approvedAt,
  complianceChecked,
  approverName,
  canApprove,
  disabled = false,
}: {
  taskId: string;
  channel: string | null;
  approvedById: string | null;
  approvedAt: Date | string | null;
  complianceChecked: boolean;
  /** Resolved from the already-loaded user list — no extra query. */
  approverName?: string | null;
  canApprove: boolean;
  disabled?: boolean;
}) {
  // Not a content item → the gate doesn't apply.
  if (!channel) return null;

  const at = approvedAt ? (approvedAt instanceof Date ? approvedAt : new Date(approvedAt)) : null;
  const approved = Boolean(approvedById && at);

  if (approved) {
    return (
      <div className="capprove is-approved">
        <div className="capprove-state">
          <span className="capprove-dot" aria-hidden="true" />
          <span className="capprove-text">
            Approved by <strong>{approverName || "a manager"}</strong> · {fmtIst(at!)}
          </span>
          <span className={`capprove-badge ${complianceChecked ? "ok" : "warn"}`}>
            {complianceChecked ? "Compliance checked" : "Compliance not checked"}
          </span>
        </div>

        {canApprove && !disabled ? (
          <form action={revokeContentApproval} className="capprove-form">
            <input type="hidden" name="taskId" value={taskId} />
            <button type="submit" className="btn btn-ghost btn-sm">
              Withdraw approval
            </button>
          </form>
        ) : null}
      </div>
    );
  }

  return (
    <div className="capprove is-pending">
      <div className="capprove-state">
        <span className="capprove-dot" aria-hidden="true" />
        <span className="capprove-text">
          Not approved yet — this can&rsquo;t move to Scheduled or Published.
        </span>
      </div>

      {disabled ? null : canApprove ? (
        <form action={approveContent} className="capprove-form">
          <input type="hidden" name="taskId" value={taskId} />
          <label className="capprove-check">
            <input type="checkbox" name="complianceChecked" defaultChecked={complianceChecked} />
            <span>Disclaimers &amp; registration details present</span>
          </label>
          <input
            type="text"
            name="note"
            maxLength={500}
            placeholder="Note (optional)"
            className="capprove-note"
          />
          <button type="submit" className="btn btn-primary btn-sm">
            Approve
          </button>
        </form>
      ) : (
        <div className="capprove-hint">Ask an admin or manager to sign this off.</div>
      )}
    </div>
  );
}
