// apps/web/app/reviews/review-attachments.tsx
//
// Client component for uploading and displaying attachments on a review response.
// Accepts PDFs, presentations, documents, and images (max 3, 10MB each).

"use client";

import { useRef, useState, useCallback } from "react";

type Attachment = {
  id: string;
  filename: string;
  mime: string | null;
  sizeBytes: number;
  url: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string | null, filename: string): string {
  if (mime === "application/pdf") return "📄";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["ppt", "pptx"].includes(ext)) return "📑";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["xls", "xlsx"].includes(ext)) return "📊";
  if (mime?.startsWith("image/")) return "🖼";
  return "📎";
}

export function ReviewAttachments({
  responseId,
  initialAttachments,
  disabled = false,
}: {
  responseId: string;
  initialAttachments: Attachment[];
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdd = attachments.length < MAX_ATTACHMENTS && !disabled;

  const uploadFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setError(null);
      const files = Array.from(fileList);
      const slotsLeft = MAX_ATTACHMENTS - attachments.length;

      if (files.length > slotsLeft) {
        setError(`Only ${slotsLeft} more file(s) allowed (max ${MAX_ATTACHMENTS}).`);
      }

      const toUpload = files.slice(0, Math.max(0, slotsLeft));
      if (!toUpload.length) return;

      // Client-side validation
      for (const f of toUpload) {
        if (f.size > MAX_FILE_SIZE) {
          setError(`"${f.name}" exceeds 10 MB limit.`);
          return;
        }
      }

      setUploading(true);
      try {
        const fd = new FormData();
        toUpload.forEach((f) => fd.append("files", f));
        const res = await fetch(`/api/reviews/${responseId}/attachments`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Upload failed");
          return;
        }
        if (data.warning) setError(data.warning);
        if (data.attachments) {
          setAttachments((prev) => [...prev, ...data.attachments]);
        }
      } catch (e: any) {
        setError(e.message || "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [responseId, attachments.length],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!canAdd) return;
    uploadFiles(e.dataTransfer.files);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) uploadFiles(e.target.files);
    e.target.value = "";
  }

  return (
    <div className="review-attach-section">
      <div className="flex items-center gap-2 mb-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14" className="text-text-3">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="text-[12px] text-text-2 font-medium">
          Supporting Documents
        </span>
        <span className="text-[11px] text-text-4">
          ({attachments.length}/{MAX_ATTACHMENTS})
        </span>
      </div>

      {/* Existing attachments */}
      {attachments.length > 0 && (
        <div className="attachment-list mb-2">
          {attachments.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="attachment-item"
              title={`${a.filename} · ${formatSize(a.sizeBytes)}`}
            >
              <span className="attachment-icon">{fileIcon(a.mime, a.filename)}</span>
              <span className="attachment-name">{a.filename}</span>
              <span className="attachment-size">{formatSize(a.sizeBytes)}</span>
            </a>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {canAdd && (
        <div
          className={`attachment-dropzone ${dragOver ? "is-drag" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            onChange={onInputChange}
            className="hidden"
            accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
          />
          {uploading ? (
            <span className="text-text-3 text-xs">Uploading...</span>
          ) : (
            <span className="text-text-3 text-xs">
              Drop PDFs, presentations, or documents here — or click to browse
              <span className="block text-[10px] text-text-4 mt-0.5">
                Max 10 MB per file · {MAX_ATTACHMENTS - attachments.length} slot{MAX_ATTACHMENTS - attachments.length !== 1 ? "s" : ""} remaining
              </span>
            </span>
          )}
        </div>
      )}

      {error && <div className="text-[12px] text-danger mt-1">{error}</div>}
    </div>
  );
}
