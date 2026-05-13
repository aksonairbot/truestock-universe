"use client";

import { useTransition } from "react";
import { updateMemberManager } from "./actions";

type User = { id: string; name: string };

export function ManagerSelect({
  memberId,
  currentManagerId,
  users,
}: {
  memberId: string;
  currentManagerId: string | null;
  users: User[];
}) {
  const [pending, start] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData();
    fd.set("memberId", memberId);
    fd.set("managerId", e.target.value);
    start(async () => {
      await updateMemberManager(fd);
    });
  }

  // Filter out the member themselves from the list
  const options = users.filter((u) => u.id !== memberId);

  return (
    <select
      value={currentManagerId ?? ""}
      onChange={onChange}
      disabled={pending}
      className="inline-select"
      title="Change reporting manager"
    >
      <option value="">No manager</option>
      {options.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  );
}
