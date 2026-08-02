// apps/web/app/tasks/post-composer.tsx
//
// THE POST COMPOSER. Learned from Planable / Buffer / SocialPilot: what makes
// a social tool usable is that the COPY is a first-class field with the target
// network's limit enforced while you type — not a paragraph in a task
// description that gets silently truncated at publish time.
//
// It replaces a real bug. The publisher used to send the task DESCRIPTION as
// the caption and slice it at 2200 characters for every channel, which
// destroyed the tail of any X post (limit 280) and leaked internal notes —
// acceptance criteria, links for the designer — into public captions.
//
// Three things here that the good tools all do and matter more than they look:
//   * the counter counts CODE POINTS, so an emoji is 1 and not 2
//   * over the limit is a hard stop with a number, not a silent trim
//   * the first comment is its own field, because hashtags-in-first-comment is
//     standard practice and there was nowhere else to put them

"use client";

import { useState } from "react";
import { updatePostContent } from "./post-actions";
import { ActionForm } from "@/components/action-form";
import {
  CONTENT_PILLARS,
  PILLAR_COLOR,
  captionLimit,
  countChars,
  CHANNEL_SUPPORTS_FIRST_COMMENT,
  CHANNEL_LABEL,
} from "@/lib/content";

export function PostComposer({
  taskId,
  channel,
  caption,
  firstComment,
  pillar,
  disabled = false,
}: {
  taskId: string;
  channel: string | null;
  caption: string;
  firstComment: string;
  pillar: string | null;
  disabled?: boolean;
}) {
  const [text, setText] = useState(caption);
  const [fc, setFc] = useState(firstComment);

  // Not a content item yet — the composer would be asking for copy with no
  // destination.
  if (!channel) return null;

  const limit = captionLimit(channel);
  const used = countChars(text);
  const over = limit > 0 && used > limit;
  // Warn before it's a problem, not at the moment it becomes one.
  const near = limit > 0 && !over && used > limit * 0.9;
  const allowFirstComment = CHANNEL_SUPPORTS_FIRST_COMMENT.has(channel);

  return (
    <ActionForm action={updatePostContent} className="pcomp">
      <input type="hidden" name="taskId" value={taskId} />

      <div className="pcomp-head">
        <span className="pcomp-title">Post copy</span>
        <span className="pcomp-for">for {CHANNEL_LABEL[channel] ?? channel}</span>
        {limit > 0 ? (
          <span className={`pcomp-count ${over ? "is-over" : near ? "is-near" : ""}`}>
            {used}/{limit}
            {over ? ` · ${used - limit} over` : null}
          </span>
        ) : (
          <span className="pcomp-count">{used} characters</span>
        )}
      </div>

      <textarea
        name="caption"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder="What the audience actually reads. Keep internal notes in the description above."
        className={`pcomp-text ${over ? "is-over" : ""}`}
      />

      {over ? (
        <div className="pcomp-warn">
          {CHANNEL_LABEL[channel]} rejects anything over {limit} characters. Trim {used - limit} and it
          will save — nothing is truncated for you.
        </div>
      ) : null}

      {allowFirstComment ? (
        <label className="pcomp-field">
          <span className="pcomp-label">
            First comment <span className="pcomp-hint">hashtags and links, posted right after</span>
          </span>
          <textarea
            name="firstComment"
            rows={2}
            value={fc}
            onChange={(e) => setFc(e.target.value)}
            disabled={disabled}
            placeholder="#nifty #trading — keeps the caption clean"
            className="pcomp-text pcomp-text-sm"
          />
        </label>
      ) : null}

      <div className="pcomp-foot">
        <label className="pcomp-field pcomp-field-inline">
          <span className="pcomp-label">Pillar</span>
          <select
            name="pillar"
            defaultValue={pillar ?? ""}
            disabled={disabled}
            className="content-select"
            style={pillar ? { color: PILLAR_COLOR[pillar], borderColor: PILLAR_COLOR[pillar] } : undefined}
          >
            <option value="">Not set</option>
            {CONTENT_PILLARS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        {!disabled ? (
          <button type="submit" className="btn btn-primary btn-sm" disabled={over}>
            Save copy
          </button>
        ) : null}
      </div>

      {/* A preview, not a mockup. It shows the two things that actually go
          wrong: where the platform cuts the visible text off, and whether the
          first comment reads as a separate block. */}
      {text.trim() ? (
        <div className="pcomp-preview">
          <div className="pcomp-preview-h">Preview</div>
          <div className="pcomp-preview-body">
            {(() => {
              const chars = [...text];
              // Instagram/Facebook collapse after ~125 chars behind "more".
              const foldAt = channel === "instagram" || channel === "facebook" ? 125 : 0;
              if (foldAt && chars.length > foldAt) {
                return (
                  <>
                    <span>{chars.slice(0, foldAt).join("")}</span>
                    <span className="pcomp-fold"> … more</span>
                    <div className="pcomp-folded">{chars.slice(foldAt).join("")}</div>
                  </>
                );
              }
              return <span>{text}</span>;
            })()}
          </div>
          {allowFirstComment && fc.trim() ? <div className="pcomp-preview-fc">{fc}</div> : null}
        </div>
      ) : null}
    </ActionForm>
  );
}
