"use client";

import { useTransition } from "react";
import { updateMemberDepartment } from "./actions";

type Dept = { id: string; name: string };

export function DepartmentSelect({
  memberId,
  currentDepartmentId,
  departments,
}: {
  memberId: string;
  currentDepartmentId: string | null;
  departments: Dept[];
}) {
  const [pending, start] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData();
    fd.set("memberId", memberId);
    fd.set("departmentId", e.target.value);
    start(async () => {
      await updateMemberDepartment(fd);
    });
  }

  return (
    <select
      value={currentDepartmentId ?? ""}
      onChange={onChange}
      disabled={pending}
      className="inline-select"
      title="Change department"
    >
      <option value="">No department</option>
      {departments.map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </select>
  );
}
