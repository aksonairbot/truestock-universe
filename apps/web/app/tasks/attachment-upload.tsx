// apps/web/app/tasks/attachment-upload.tsx
//
// Client component — file picker with drag-and-drop + previews.
// Used in NewTaskForm (deferred upload after creation) and task detail (immediate upload).

"use client";

import { useRef, useState, useCallback } from "react";

export type PendingFile = {
  file: File;
  preview: string | null; // data URL for images, null for others
};

export type ExistingAttachment = {
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

function isImage(mime: string | null): boolean {
  return !!mime && mime.startsWith("image/");
}

function fileIcon(mime: string | null, filename: string): string {
  if (isImage(mime)) return "🖼";
  if (mime === "application/pdf") return "📄";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["xls", "xlsx"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📑";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜";
  return "📎";
}

interface AttachmentUploadProps {
  /** Existing attachments already on the task (for task detail view) */
  existing?: ExistingAttachment[];
  /** Controlled pending files (for new task form — upload happens after creation) */
  pendingFiles?: PendingFile[];
  onPendingChange?: (files: PendingFile[]) => void;
  /** If set, files are uploaded immediately to this task */
  taskId?: string;
  /** Callback after successful immediate upload */
  onUploaded?: (attachment: ExistingAttachment) => void;
  /** Whether the task is closed (no new uploads allowed) */
  disabled?: boolean;
}

export function AttachmentUpload({
  existing = [],
  pendingFiles,
  onPendingChange,
  taskId,
  onUploaded,
  disabled = false,
}: AttachmentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCount = existing.length + (pendingFiles?.length ?? 0);
  const canAdd = totalCount < MAX_ATTACHMENTS && !disabled;

  const addFiles = useCallback(
    async (fileList: FileList | File[]) => {
      setError(null);
      const files = Array.from(fileList);
      const slotsLeft = MAX_ATTACHMENTS - totalCount;

      if (files.length > slotsLeft) {
        setError(`Only ${slotsLeft} more file(s) allowed (max ${MAX_ATTACHMENTS}).`);
      }

      const toAdd = files.slice(0, Math.max(0, slotsLeft));
      const validated: File[] = [];

      for (const f of toAdd) {
        if (f.size > MAX_FILE_SIZE) {
          setError(`"${f.name}" exceeds 10 MB limit.`);
          continue;
        }
        validated.push(f);
      }

      if (!validated.length) return;

      // Immediate upload mode (task detail)
      if (taskId) {
        setUploading(true);
        try {
          const fd = new FormData();
          validated.forEach((f) => fd.append("files", f));
          const res = await fetch(`/api/tasks/${taskId}/attachments`, {
            method: "POST",
            body: fd,
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || "Upload failed");
            return;
          }
          if (data.warning) setError(data.warning);
          data.attachments?.forEach((a: ExistingAttachment) => onUploaded?.(a));
        } catch (e: any) {
          setError(e.message || "Upload failed");
        } finally {
          setUploading(false);
        }
        return;
      }

      // Deferred mode (new task form) — store as pending
      const newPending: PendingFile[] = [];
      for (const f of validated) {
        let preview: string | null = null;
        if (f.type.startsWith("image/")) {
          preview = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(f);
          });
        }
        newPending.push({ file: f, preview });
      }
      onPendingChange?.([...(pendingFiles ?? []), ...newPending]);
    },
    [taskId, totalCount, pendingFiles, onPendingChange, onUploaded],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!canAdd) return;
    addFiles(e.dataTransfer.files);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = ""; // reset so same file can be re-selected
  }

  function removePending(idx: number) {
    if (!pendingFiles) return;
    const next = [...pendingFiles];
    next.splice(idx, 1);
    onPendingChange?.(next);
  }

  return (
    <div className="attachment-section">
      {/* Existing attachments */}
      {existing.length > 0 && (
        <div className="attachment-list">
          {existing.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="attachment-item"
              title={`${a.filename} · ${formatSize(a.sizeBytes)}`}
            >
              {isImage(a.mime) ? (
                <img
                  src={a.url}
                  alt={a.filename}
                  className="attachment-thumb"
                />
              ) : (
                <span className="attachment-icon">{fileIcon(a.mime, a.filename)}</span>
              )}
              <span className="attachment-name">{a.filename}</span>
              <span className="attachment-size">{formatSize(a.sizeBytes)}</span>
            </a>
          ))}
        </div>
      )}

      {/* Pending files (new task form) */}
      {pendingFiles && pendingFiles.length > 0 && (
        <div className="attachment-list">
          {pendingFiles.map((p, i) => (
            <div key={i} className="attachment-item is-pending">
              {p.preview ? (
                <img src={p.preview} alt={p.file.name} className="attachment-thumb" />
              ) : (
                <span className="attachment-icon">{fileIcon(p.file.type, p.file.name)}</span>
              )}
              <span className="attachment-name">{p.file.name}</span>
              <span className="attachment-size">{formatSize(p.file.size)}</span>
              <button
                type="button"
                onClick={() => removePending(i)}
                className="attachment-remove"
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / Add button */}
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
            accept="*/*"
          />
          {uploading ? (
            <span className="text-text-3 text-xs">Uploading...</span>
          ) : (
            <span className="text-text-3 text-xs">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16" className="inline -mt-0.5 mr-1">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Drop files here or click to browse
              <span className="block text-[10px] text-text-4 mt-0.5">
                Max 10 MB per file · {MAX_ATTACHMENTS - totalCount} slot{MAX_ATTACHMENTS - totalCount !== 1 ? "s" : ""} remaining
              </span>
            </span>
          )}
        </div>
      )}

      {/* Full indicator */}
      {!canAdd && !disabled && totalCount >= MAX_ATTACHMENTS && (
        <div className="text-[11px] text-text-3 mt-1">
          Maximum {MAX_ATTACHMENTS} attachments reached.
        </div>
      )}

      {error && <div className="text-[12px] text-danger mt-1">{error}</div>}
    </div>
  );
}
