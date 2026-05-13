// apps/web/app/projects/project-banner.tsx
//
// Renders the AI-generated cosmic banner for a project. Falls back to a flat
// gradient bar when no banner exists for the slug. Banner files live in
// apps/web/public/banners/{slug}.webp. Generated via Higgsfield (soul_location)
// once per project, served as static assets.

const KNOWN_BANNERS = new Set([
  "bloom-prime-launch",
  "stockbee-q2-growth",
  "high-private-beta",
  "axe-cap-mvp",
  "skynet-platform",
  "skynet-marketing-engine",
]);

export function ProjectBanner({
  slug,
  title,
  productLabel,
  color,
  description,
  height = "tall",
}: {
  slug: string;
  title: string;
  productLabel?: string | null;
  color?: string | null;
  description?: string | null;
  height?: "tall" | "thumb";
}) {
  const has = KNOWN_BANNERS.has(slug);
  const bg = has ? `url(/banners/${slug}.webp)` : undefined;
  const accentColor = color ?? "#7B5CFF";

  return (
    <div
      className={`project-banner ${has ? "" : "is-fallback"} ${height === "thumb" ? "is-thumb" : "is-tall"}`}
      style={
        has
          ? { backgroundImage: bg }
          : { background: `linear-gradient(135deg, ${accentColor}33, var(--bg-2) 70%)` }
      }
    >
      <div className="project-banner-fade" />
      <div className="project-banner-text">
        {productLabel ? (
          <div className="project-banner-product" style={{ color: accentColor }}>
            {productLabel}
          </div>
        ) : null}
        <div className="project-banner-title">{title}</div>
        {description && height === "tall" ? (
          <div className="project-banner-desc">{description}</div>
        ) : null}
      </div>
    </div>
  );
}
