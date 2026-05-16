---
name: Task creation UX rules
description: Assignee must be pre-selected (defaults to creator) and required; due date is mandatory; clarity check before submit
type: feedback
originSessionId: 578800ae-3af6-4391-b443-4c882ff6a97b
---
Assignee dropdown on /tasks/new must default to the currently logged-in user and is required — no "unassigned" option. User can change to anyone else but must pick someone before creating.

**Why:** Amit wants every task to have an owner from the moment it's created. Unassigned tasks get lost.

**How to apply:** The `NewTaskForm` component takes `currentUserId` prop (passed from server component via `getCurrentUser()`). The assignee `<select>` has `required` and no empty option. Due date is also mandatory (`required` + server-side validation in `createTask` action). Both fields show a red asterisk.
