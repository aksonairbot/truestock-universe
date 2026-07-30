// apps/web/app/tasks/variant-manager.tsx
//
// "This idea, on these networks." One post fanned out into per-channel
// variants, each with its own copy, slot, approval and publish state.
//
// The list is the important half. Before this, three channel versions of the
// same idea were three unrelated tasks, and the only way to know whether the
// LinkedIn one had gone out was to remember it existed. Now every sibling
// shows its stage and live state next to the one you're looking at.

"use client";

import Link from "next/link";
import { useState } from "react";
import { createVariants, unlinkVariant } from "./variant-actions";
import { CONTENT_CHANNELS, CHANNEL_COLOR, CHANNEL_LABEL, STAGE_COLOR, STAGE_LABEL } from "@/lib/content";

export interface Sibling {
  id: string;
  title: string;
  channel: string | null;
  stage: string | null;
  publishState: string;
  approvedAt: Date | string | null;
}

export function VariantManager({
  taskId,
  channel,
  siblings,
  disabled = false,
}: {
  taskId: string;
  channel: string | null;
  siblings: Sibling[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  // Not a content item — there is no network to fan out to yet.
  if (!channel) return null;

  const covered = new Set<string>([channel, ...siblings.map((s) => s.channel ?? "")]);
  const available = CONTENT_CHANNELS.filter((c) => !covered.has(c.value));

  function toggle(v: string) {
    setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  }

  return (
    <div className="vman">
      {siblings.length > 0 ? (
        <div className="vman-list">
          <div className="vman-h">Also going out on</div>
          {siblings.map((s) => {
            const live = s.publishState === "published";
            const failed = s.publishState === "failed";
            return (
              <Link key={s.id} href={`/tasks/${s.id}`} className="vman-row no-underline">
                <span
                  className="content-chip"
                  style={{
                    color: CHANNEL_COLOR[s.channel ?? ""] ?? "var(--text-3)",
                    borderColor: CHANNEL_COLOR[s.channel ?? ""] ?? "var(--border)",
                  }}
                >
                  {CHANNEL_LABEL[s.channel ?? ""] ?? "Content"}
                </span>
                <span
                  className="content-chip"
                  style={{ color: STAGE_COLOR[s.stage ?? "idea"], borderColor: STAGE_COLOR[s.stage ?? "idea"] }}
                >
                  {STAGE_LABEL[s.stage ?? "idea"]}
                </span>
                {live ? <span className="vman-flag is-ok">live</span> : null}
                {failed ? <span className="vman-flag is-err">failed</span> : null}
                {!live && !failed && !s.approvedAt ? (
                  <span className="vman-flag is-warn">unapproved</span>
                ) : null}
                <span className="vman-open">open →</span>
              </Link>
            );
          })}

          {!disabled ? (
            <form action={unlinkVariant} className="vman-unlink">
              <input type="hidden" name="taskId" value={taskId} />
              <button type="submit" className="btn btn-ghost btn-sm">
                Remove this post from the group
              </button>
              <span className="vman-note">The post stays; it just stops being part of this set.</span>
            </form>
          ) : null}
        </div>
      ) : null}

      {disabled || available.length === 0 ? null : !open ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          {siblings.length > 0 ? "Add another network" : "Also post this to other networks"}
        </button>
      ) : (
        <form action={createVariants} className="vman-form">
          <input type="hidden" name="taskId" value={taskId} />
          <div className="vman-h">Create a variant for</div>
          <div className="vman-picks">
            {available.map((c) => (
              <label key={c.value} className={`vman-pick ${picked.includes(c.value) ? "is-on" : ""}`}>
                <input
                  type="checkbox"
                  name="channels"
                  value={c.value}
                  checked={picked.includes(c.value)}
                  onChange={() => toggle(c.value)}
                />
                <span className="vman-pick-dot" style={{ background: c.color }} />
                {c.label}
              </label>
            ))}
          </div>
          <div className="vman-foot">
            <button type="submit" className="btn btn-primary btn-sm" disabled={picked.length === 0}>
              Create {picked.length > 0 ? picked.length : ""} variant{picked.length === 1 ? "" : "s"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <div className="vman-note">
            Each variant copies this post&rsquo;s copy, brief, slot and pillar, and starts as an
            unapproved idea. Copy that&rsquo;s too long for a network shows red in its composer —
            trim it there rather than here.
          </div>
        </form>
      )}
    </div>
  );
}
