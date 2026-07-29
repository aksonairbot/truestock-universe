// apps/web/app/tasks/publish-panel.tsx
//
// The publish state of a content item, and the controls for changing it.
//
// Only rendered for content that Upload-post can actually post to. Channels
// that go out elsewhere (email, ads, webinars, the blog) get the "mark it
// published by hand" path instead — pretending we can post them would be
// worse than admitting we can't.

import { publishNow, resetPublishState } from "./publish-actions";
import { isPublishableChannel } from "@/lib/upload-post";
import { CHANNEL_LABEL } from "@/lib/content";

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

export function PublishPanel({
  taskId,
  channel,
  approved,
  publishState,
  publishedUrl,
  publishedAt,
  publishError,
  canPublish,
  configured,
  disabled = false,
}: {
  taskId: string;
  channel: string | null;
  approved: boolean;
  publishState: string;
  publishedUrl: string | null;
  publishedAt: Date | string | null;
  publishError: string | null;
  canPublish: boolean;
  /** Server has the Upload-post credentials. */
  configured: boolean;
  disabled?: boolean;
}) {
  if (!channel) return null;

  const at = publishedAt ? (publishedAt instanceof Date ? publishedAt : new Date(publishedAt)) : null;
  const label = CHANNEL_LABEL[channel] ?? channel;
  const auto = isPublishableChannel(channel);

  if (publishState === "published") {
    return (
      <div className="cpub is-published">
        <div className="cpub-state">
          <span className="cpub-dot" aria-hidden="true" />
          <span className="cpub-text">
            Published to {label}
            {at ? ` · ${fmtIst(at)}` : null}
          </span>
          {publishedUrl ? (
            <a href={publishedUrl} target="_blank" rel="noopener noreferrer" className="cpub-link">
              View live post ↗
            </a>
          ) : null}
        </div>
        {canPublish && !disabled ? (
          <form action={resetPublishState} className="cpub-form">
            <input type="hidden" name="taskId" value={taskId} />
            <button type="submit" className="btn btn-ghost btn-sm">Clear</button>
          </form>
        ) : null}
      </div>
    );
  }

  if (publishState === "publishing") {
    return (
      <div className="cpub is-working">
        <div className="cpub-state">
          <span className="cpub-dot" aria-hidden="true" />
          <span className="cpub-text">Publishing to {label}…</span>
        </div>
      </div>
    );
  }

  const failed = publishState === "failed";

  return (
    <div className={`cpub ${failed ? "is-failed" : "is-idle"}`}>
      <div className="cpub-state">
        <span className="cpub-dot" aria-hidden="true" />
        <span className="cpub-text">
          {failed ? (
            <>
              Publishing failed — <span className="cpub-err">{publishError ?? "unknown error"}</span>
            </>
          ) : !auto ? (
            <>{label} goes out through another system — record it here once it&rsquo;s live.</>
          ) : !approved ? (
            <>Not published. Needs approval first.</>
          ) : !configured ? (
            <>Not published. Connect Upload-post on the server to publish from here.</>
          ) : (
            <>Ready to publish to {label}.</>
          )}
        </span>
      </div>

      {!canPublish || disabled ? null : (
        <div className="cpub-actions">
          {auto && approved && configured ? (
            <form action={publishNow} className="cpub-form">
              <input type="hidden" name="taskId" value={taskId} />
              <button type="submit" className="btn btn-primary btn-sm">
                {failed ? "Retry publish" : "Publish now"}
              </button>
            </form>
          ) : null}

          {approved ? (
            <form action={resetPublishState} className="cpub-form">
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="markPublished" value="true" />
              <input
                type="url"
                name="publishedUrl"
                placeholder="Live URL (optional)"
                className="cpub-url"
              />
              <button type="submit" className="btn btn-ghost btn-sm">Mark published</button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}
