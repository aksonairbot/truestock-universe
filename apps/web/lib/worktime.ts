// apps/web/lib/worktime.ts
//
// Working-time utilities for due dates.
// Working day = Mon–Fri, 9 AM – 6 PM IST (9 hours).
// "3 days" = 3 working days. "8 hours" = 8 working hours.

const TZ = "Asia/Kolkata";
const WORK_START_H = 9;  // 9 AM
const WORK_END_H = 18;   // 6 PM
const HOURS_PER_DAY = WORK_END_H - WORK_START_H; // 9

/** Check if a day (0=Sun..6=Sat) is a working day. */
function isWorkDay(dow: number): boolean {
  return dow >= 1 && dow <= 5; // Mon-Fri
}

/** Get current IST date/time. */
function nowIST(): Date {
  // Create a date string in IST and parse it back
  const now = new Date();
  return now;
}

/** Get the IST day-of-week for a Date (0=Sun..6=Sat). */
function istDow(d: Date): number {
  const s = d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "short" });
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[s] ?? 0;
}

/** Get IST hour (0-23) for a Date. */
function istHour(d: Date): number {
  return Number(d.toLocaleString("en-US", { timeZone: TZ, hour: "numeric", hour12: false }));
}

/**
 * Convert a working-time offset ("3d", "8h", "1d 4h") into an actual
 * deadline Date, starting from `from` (default: now).
 */
export function offsetToDeadline(input: string, from?: Date): Date {
  const base = from ?? new Date();
  let totalHours = 0;

  // Parse "3d", "8h", "3d 4h", "3 days", "8 hours", "3d4h", plain number (days)
  const dayMatch = input.match(/(\d+)\s*d(?:ays?)?/i);
  const hourMatch = input.match(/(\d+)\s*h(?:ours?|rs?)?/i);

  if (dayMatch) totalHours += Number(dayMatch[1]) * HOURS_PER_DAY;
  if (hourMatch) totalHours += Number(hourMatch[1]);
  // Plain number → treat as days
  if (!dayMatch && !hourMatch) {
    const n = Number(input);
    if (!isNaN(n) && n > 0) totalHours = n * HOURS_PER_DAY;
  }
  if (totalHours <= 0) totalHours = HOURS_PER_DAY; // default to 1 day

  // Walk forward through working hours
  const cursor = new Date(base);
  let remaining = totalHours;

  // If we're outside work hours, snap to next work-start
  snapToWorkStart(cursor);

  while (remaining > 0) {
    const dow = istDow(cursor);
    const hour = istHour(cursor);

    if (!isWorkDay(dow)) {
      // Skip to Monday 9 AM
      cursor.setDate(cursor.getDate() + (dow === 0 ? 1 : 8 - dow));
      setISTHour(cursor, WORK_START_H);
      continue;
    }

    const hoursLeftToday = WORK_END_H - hour;
    if (hoursLeftToday <= 0) {
      // Past work hours — skip to next day 9 AM
      cursor.setDate(cursor.getDate() + 1);
      setISTHour(cursor, WORK_START_H);
      continue;
    }

    if (remaining <= hoursLeftToday) {
      cursor.setTime(cursor.getTime() + remaining * 3600_000);
      remaining = 0;
    } else {
      remaining -= hoursLeftToday;
      cursor.setDate(cursor.getDate() + 1);
      setISTHour(cursor, WORK_START_H);
    }
  }

  return cursor;
}

/** Convert a deadline to YYYY-MM-DD string in IST. */
export function deadlineToDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

/**
 * Format a due date as a working-time countdown.
 * Returns e.g. "2d 4h", "6h", "3d", "overdue 1d 2h", "due today 3h".
 */
export function fmtDueCountdown(dueDate: string | Date | null): string {
  if (!dueDate) return "—";

  const now = new Date();
  // Due date stored as YYYY-MM-DD — treat as end of work day (6 PM IST)
  const due = typeof dueDate === "string"
    ? new Date(`${dueDate}T18:00:00+05:30`)
    : dueDate;

  const diffMs = due.getTime() - now.getTime();
  const workHours = countWorkingHours(now, due);

  if (Math.abs(workHours) < 0.5) return "due now";

  const absDays = Math.floor(Math.abs(workHours) / HOURS_PER_DAY);
  const absHours = Math.round(Math.abs(workHours) % HOURS_PER_DAY);

  let label = "";
  if (absDays > 0 && absHours > 0) label = `${absDays}d ${absHours}h`;
  else if (absDays > 0) label = `${absDays}d`;
  else label = `${absHours}h`;

  if (diffMs < 0) return `overdue ${label}`;
  if (absDays === 0) return `${label} left`;
  return `${label} left`;
}

/**
 * Short CSS-friendly status for styling.
 */
export function dueStatus(dueDate: string | Date | null): "overdue" | "today" | "soon" | "normal" | "none" {
  if (!dueDate) return "none";
  const now = new Date();
  const due = typeof dueDate === "string"
    ? new Date(`${dueDate}T18:00:00+05:30`)
    : dueDate;

  const workHours = countWorkingHours(now, due);
  if (workHours < 0) return "overdue";
  if (workHours <= HOURS_PER_DAY) return "today";
  if (workHours <= HOURS_PER_DAY * 2) return "soon";
  return "normal";
}

/** Count working hours between two dates (positive if end > start). */
function countWorkingHours(start: Date, end: Date): number {
  const sign = end >= start ? 1 : -1;
  const [a, b] = sign === 1 ? [new Date(start), end] : [new Date(end), start];

  let hours = 0;
  const cursor = new Date(a);

  // Cap at 365 days to prevent infinite loops
  const maxIterations = 365 * 2;
  let iterations = 0;

  while (cursor < b && iterations < maxIterations) {
    iterations++;
    const dow = istDow(cursor);
    const hour = istHour(cursor);

    if (!isWorkDay(dow)) {
      cursor.setDate(cursor.getDate() + 1);
      setISTHour(cursor, WORK_START_H);
      continue;
    }

    if (hour < WORK_START_H) {
      setISTHour(cursor, WORK_START_H);
      continue;
    }

    if (hour >= WORK_END_H) {
      cursor.setDate(cursor.getDate() + 1);
      setISTHour(cursor, WORK_START_H);
      continue;
    }

    const hoursLeftToday = WORK_END_H - hour;
    const endOfWorkToday = new Date(cursor);
    setISTHour(endOfWorkToday, WORK_END_H);

    if (b <= endOfWorkToday) {
      // Destination is within today's work hours
      const remaining = (b.getTime() - cursor.getTime()) / 3600_000;
      hours += Math.max(0, remaining);
      break;
    } else {
      hours += hoursLeftToday;
      cursor.setDate(cursor.getDate() + 1);
      setISTHour(cursor, WORK_START_H);
    }
  }

  return hours * sign;
}

function snapToWorkStart(d: Date): void {
  const dow = istDow(d);
  const hour = istHour(d);

  if (!isWorkDay(dow)) {
    d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow));
    setISTHour(d, WORK_START_H);
  } else if (hour >= WORK_END_H) {
    d.setDate(d.getDate() + 1);
    setISTHour(d, WORK_START_H);
    // If next day is weekend, skip
    const newDow = istDow(d);
    if (!isWorkDay(newDow)) {
      d.setDate(d.getDate() + (newDow === 0 ? 1 : 8 - newDow));
    }
  } else if (hour < WORK_START_H) {
    setISTHour(d, WORK_START_H);
  }
}

function setISTHour(d: Date, hour: number): void {
  // IST is UTC+5:30, so target UTC hour = hour - 5, minute = minute - 30
  d.setUTCHours(hour - 5, d.getUTCMinutes() >= 30 ? 0 : 30, 0, 0);
  // Simpler: set to the IST midnight then add hours
  const dayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  const target = new Date(`${dayStr}T${String(hour).padStart(2, "0")}:00:00+05:30`);
  d.setTime(target.getTime());
}
