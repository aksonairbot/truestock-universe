// apps/web/app/tasks/task-attachments.tsx
//
// Client wrapper for AttachmentUpload in task detail/pane views.
// Renders existing attachments and allows uploading more (up to 3 total).

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AttachmentUpload, type ExistingAttachment } from "./attachment-upload";

interface TaskAttachmentsProps {
  taskId: string;
  attachments: ExistingAttachment[];
  disabled?: boolean;
}

export function TaskAttachments({ taskId, attachments, disabled }: TaskAttachmentsProps) {
  const router = useRouter();
  const [list, setList] = useState<ExistingAttachment[]>(attachments);

  function onUploaded(a: ExistingAttachment) {
    setList((prev) => [...prev, a]);
    // Revalidate server data
    router.refresh();
  }

  return (
    <div className="mb-4">
      <h3 className="task-pane-section-h">
        Attachments{" "}
        <span className="text-text-3 font-normal">· {list.length}/3</span>
      </h3>
      <AttachmentUpload
        existing={list}
        taskId={taskId}
        onUploaded={onUploaded}
        disabled={disabled}
      />
    </div>
  );
}
