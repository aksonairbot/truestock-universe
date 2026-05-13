// apps/web/app/projects/project-icon-upload.tsx
//
// Small inline icon upload button for admins on the project detail page.

"use client";

import { useRef, useTransition } from "react";
import { uploadProjectIcon } from "./banner-actions";

export function ProjectIconUpload({ slug, currentIcon }: { slug: string; currentIcon?: string | null }) {
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slug", slug);
    startTransition(async () => {
      await uploadProjectIcon(fd);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={isPending}
        className="project-icon-upload-btn"
        title={currentIcon ? "Change project icon" : "Upload project icon"}
      >
        {isPending ? (
          <span className="suggest-spinner" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="12" height="12">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={handleUpload}
        hidden
      />
    </>
  );
}
