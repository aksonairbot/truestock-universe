// apps/web/app/review-card.tsx
//
// Hero card showing the AI-generated daily review on the Today page.
// Admin/managers see the team summary; everyone sees their personal review.

import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { getMyReview, getTeamReview } from "@/lib/daily-review";

export async function ReviewCard() {
  const me = await getCurrentUser();
  const amAdmin = isAdmin(me);

  const personal = await getMyReview(me.id);
  const team = amAdmin ? await getTeamReview() : null;

  // Nothing generated yet — don't render anything
  if (!personal && !team) return null;

  // Simple markdown-ish rendering: **bold** → <strong>, _italic_ → <em>
  function renderMarkdown(text: string) {
    const html = text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<strong>$1</strong>")
      .replace(/_(.+?)_/g, "<em>$1</em>")
      .replace(/\n/g, "<br/>");
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  }

  const toneLabel = (personal?.tone ?? team?.tone ?? "")
    .split("—")[0]
    ?.trim()
    .replace(/and /g, "& ");

  return (
    <div className="review-card">
      <div className="review-card-header">
        <div className="review-card-badge">Daily Review</div>
        {toneLabel ? <div className="review-card-tone">Today's vibe: {toneLabel}</div> : null}
      </div>

      {/* Team summary for admins */}
      {team ? (
        <div className="review-card-section">
          <div className="review-card-body">{renderMarkdown(team.body)}</div>
        </div>
      ) : null}

      {/* Personal review */}
      {personal ? (
        <div className="review-card-section">
          {team ? <div className="review-card-divider" /> : null}
          <div className="review-card-body">{renderMarkdown(personal.body)}</div>
        </div>
      ) : null}
    </div>
  );
}
