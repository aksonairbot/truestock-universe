// apps/web/app/projects/project-banner.tsx
//
// Renders the project banner image. Priority order:
//   1. bannerUrl from DB (admin-uploaded or assigned)
//   2. Matching file at /banners/{slug}.webp (legacy or auto-generated)
//   3. Gradient fallback using project color

"use client";

import { useState, useRef, useTransition } from "react";
import { uploadProjectBanner, assignPlaceholderBanner } from "./banner-actions";

/** Placeholder banners available in public/banners/ for quick assignment */
const PLACEHOLDER_BANNERS = [
  "cosmic-vela-bay",
  "cosmic-orion-deck",
  "cosmic-m78-port",
  "cosmic-perseus-nebula",
  "cosmic-andromeda",
  "cosmic-perseus-ridge",
  "cosmic-vega-dome",
  "cosmic-helix-dome",
];

export function ProjectBanner({
  slug,
  title,
  productLabel,
  color,
  description,
  bannerUrl,
  height = "tall",
  editable = false,
}: {
  slug: string;
  title: string;
  productLabel?: string | null;
  color?: string | null;
  description?: string | null;
  bannerUrl?: string | null;
  height?: "tall" | "thumb";
  editable?: boolean;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Legacy: if no DB bannerUrl, check for slug-matching file
  const LEGACY_BANNERS = new Set([
    "bloom-prime-launch", "stockbee-q2-growth", "high-private-beta",
    "axe-cap-mvp", "skynet-platform", "skynet-marketing-engine",
  ]);
  const bgImage = bannerUrl || (LEGACY_BANNERS.has(slug) ? `/banners/${slug}.webp` : null);
  const hasBanner = !!bgImage;
  const accentColor = color ?? "#7B5CFF";

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slug", slug);
    startTransition(async () => {
      await uploadProjectBanner(fd);
      setShowPicker(false);
    });
  }

  function handlePickPlaceholder(name: string) {
    startTransition(async () => {
      await assignPlaceholderBanner(slug, `/banners/${name}.webp`);
      setShowPicker(false);
    });
  }

  return (
    <div
      className={`project-banner ${hasBanner ? "" : "is-fallback"} ${height === "thumb" ? "is-thumb" : "is-tall"}`}
      style={
        hasBanner
          ? { backgroundImage: `url(${bgImage})` }
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

      {editable && height === "tall" ? (
        <div className="banner-admin">
          <button
            className="banner-edit-btn"
            onClick={() => setShowPicker(!showPicker)}
            disabled={isPending}
            title="Change banner"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            {isPending ? "Saving…" : "Change banner"}
          </button>

          {showPicker ? (
            <div className="banner-picker">
              <div className="banner-picker-head">
                <span>Choose a banner</span>
                <button onClick={() => setShowPicker(false)} className="banner-picker-close">&times;</button>
              </div>

              <div className="banner-picker-upload">
                <button onClick={() => fileRef.current?.click()} className="btn btn-ghost btn-sm">
                  Upload custom image
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/webp,image/png,image/jpeg"
                  onChange={handleUpload}
                  hidden
                />
              </div>

              <div className="banner-picker-label">Or pick a placeholder:</div>
              <div className="banner-picker-grid">
                {PLACEHOLDER_BANNERS.map((name) => (
                  <button
                    key={name}
                    className="banner-picker-thumb"
                    onClick={() => handlePickPlaceholder(name)}
                    style={{ backgroundImage: `url(/banners/${name}.webp)` }}
                    title={name}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
