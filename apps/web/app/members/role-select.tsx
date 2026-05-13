"use client";

import { useRef } from "react";
import { updateMemberRole } from "./actions";

const ROLE_TONE: Record<string, string> = {
  admin: "var(--danger)",
  manager: "var(--warning)",
  member: "var(--accent-2)",
  viewer: "var(--text-3)",
  agent: "var(--info)",
};

export function RoleSelect({ memberId, currentRole }: { memberId: string; currentRole: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={updateMemberRole} ref={formRef} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="memberId" value={memberId} />
      <select
        name="role"
        defaultValue={currentRole}
        className="bg-panel-2 border border-border-2 rounded px-1.5 py-0.5 text-[12px] cursor-pointer"
        style={{ color: ROLE_TONE[currentRole] }}
        onChange={() => formRef.current?.requestSubmit()}
      >
        <option value="admin">Admin</option>
        <option value="manager">Manager</option>
        <option value="member">Member</option>
        <option value="viewer">Viewer</option>
        <option value="agent">Agent</option>
      </select>
    </form>
  );
}
