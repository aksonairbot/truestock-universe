---
name: PostgreSQL enum cast requirement
description: Raw SQL comparing task_status enum column must cast text literals with ::task_status
type: feedback
originSessionId: e9b0d2ac-f202-48b1-be06-b79ab2f1ca6c
---
When writing raw SQL against PostgreSQL enum columns (e.g. `task_status`), always cast text literals to the enum type. Plain text comparison fails with "operator does not exist: task_status = text".

**Why:** PostgreSQL custom enums are distinct types — implicit cast from text doesn't happen in all contexts (especially `NOT IN` and `= ANY(ARRAY[...])`).

**How to apply:**
- `NOT IN` → `sql\`${tasks.status} NOT IN ('done'::task_status,'cancelled'::task_status)\``
- `ANY(ARRAY)` → `sql\`${tasks.status} = ANY(ARRAY['backlog','todo']::task_status[])\``
- Drizzle's `eq(tasks.status, "done")` handles casting automatically — only raw `sql` template literals need manual casts
- This applies to all enums in the schema: `task_status`, `task_priority`, `subscription_status`, `payment_status`, etc.
