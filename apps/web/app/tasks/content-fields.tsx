// apps/web/app/tasks/content-fields.tsx
//
// The "publish" block on a task: channel, pipeline stage, and publish slot.
// Collapsed to a single line until a channel is chosen, so ordinary tasks
// aren't burdened with marketing fields they'll never use.

import { updateTaskContent } from "./content-actions";
import { ActionForm } from "@/components/action-form";
import { CONTENT_CHANNELS, CONTENT_STAGES, CHANNEL_COLOR, STAGE_COLOR, utcToIstParts } from "@/lib/content";

export function ContentFields({
  taskId,
  channel,
  stage,
  publishAt,
  disabled = false,
}: {
  taskId: string;
  channel: string | null;
  stage: string | null;
  publishAt: Date | string | null;
  disabled?: boolean;
}) {
  const pub = publishAt ? (publishAt instanceof Date ? publishAt : new Date(publishAt)) : null;
  const parts = pub ? utcToIstParts(pub) : { date: "", time: "" };
  const isContent = Boolean(channel);

  return (
    <ActionForm action={updateTaskContent} className={`content-fields ${isContent ? "is-content" : ""}`}>
      <input type="hidden" name="taskId" value={taskId} />

      <div className="content-fields-row">
        <label className="content-field">
          <span className="content-field-label">Channel</span>
          <select
            name="contentChannel"
            defaultValue={channel ?? ""}
            disabled={disabled}
            className="content-select"
            style={channel ? { color: CHANNEL_COLOR[channel], borderColor: CHANNEL_COLOR[channel] } : undefined}
          >
            <option value="">Not content</option>
            {CONTENT_CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>

        {isContent ? (
          <>
            <label className="content-field">
              <span className="content-field-label">Stage</span>
              <select
                name="contentStage"
                defaultValue={stage ?? "idea"}
                disabled={disabled}
                className="content-select"
                style={stage ? { color: STAGE_COLOR[stage], borderColor: STAGE_COLOR[stage] } : undefined}
              >
                {CONTENT_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </label>

            <label className="content-field">
              <span className="content-field-label">Publish date</span>
              <input
                type="date"
                name="publishDate"
                defaultValue={parts.date}
                disabled={disabled}
                className="content-input"
              />
            </label>

            <label className="content-field">
              <span className="content-field-label">Time (IST)</span>
              <input
                type="time"
                name="publishTime"
                defaultValue={parts.time || "10:00"}
                disabled={disabled}
                className="content-input"
              />
            </label>
          </>
        ) : null}

        {!disabled ? (
          <button type="submit" className="btn btn-ghost btn-sm content-save">
            {isContent ? "Update" : "Make it content"}
          </button>
        ) : null}
      </div>
    </ActionForm>
  );
}
