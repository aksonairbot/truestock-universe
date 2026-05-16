`@tu/db` (packages/db/src/index.ts) exports:
- Schema: `* from "./schema.js"` (users, tasks, projects, departments, taskComments, etc.)
- Drizzle operators: `sql, eq, and, or, gte, lte, lt, gt, desc, asc, isNull, inArray, ilike, like`
- Functions: `getDb()`, `closeDb()`, `schema`

**NOT exported:** `not`, `ne`, `between`, `exists`, `notExists`, `count`, `sum`, `avg`

When you need `not`: use raw SQL instead (e.g. `sql\`${tasks.status} NOT IN (...)\``).
When using raw SQL with enum columns: cast text literals (see feedback_pg_enum_casts.md).
When filtering by array membership: use `inArray()` not `sql\`= ANY()\``.
