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

// IST is a FIXED +05:30 offset with no DST, so wall-clock parts can be read
// arithmetically. The previous versions of these two helpers each built an
// Intl formatter via toLocaleString — and countWorkingHours called them up to
// 730 times per task, i.e. ~1,400 formatter constructions PER ROW. Measured
// 2026-07-28: that made /tasks ~250ms slower per rendered row (900ms total)
// while the board — which formats on the client — served in 90ms.
const IST_OFFSET_MS = 5.5 * 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Day index since the IST epoch day (1970-01-01 IST, a Thursday). */
function istDayIndex(t: number): number {
  return Math.floor((t + IST_OFFSET_MS) / MS_PER_DAY);
}

/** Day-of-week (0=Sun..6=Sat) for a day index. 1970-01-01 was a Thursday. */
function dowOfDayIndex(i: number): number {
  return (((i + 4) % 7) + 7) % 7;
}

/** Get the IST day-of-week for a Date (0=Sun..6=Sat). */
function istDow(d: Date): number {
  return dowOfDayIndex(istDayIndex(d.getTime()));
}

/** Get IST hour (0-23) for a Date. */
function istHour(d: Date): number {
  const shifted = d.getTime() + IST_OFFSET_MS;
  return Math.floor((((shifted % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / 3_600_000);
}

/** IST hour as a float (e.g. 14.5 for 2:30 PM). */
function istHourFloat(d: Date): number {
  const shifted = d.getTime() + IST_OFFSET_MS;
  return (((shifted % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / 3_600_000;
}

/** Working days strictly before day index `i`, counting from index 0. */
function workDaysBefore(i: number): number {
  const weeks = Math.floor(i / 7);
  let count = weeks * 5;
  for (let k = weeks * 7; k < i; k++) {
    const dow = dowOfDayIndex(k);
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

/**
 * Total working hours elapsed from the epoch to `t`. Working hours between
 * any two instants is then just W(end) - W(start) — exact, and O(1) instead
 * of walking one day at a time.
 */
function workHoursSinceEpoch(t: number): number {
  const day = istDayIndex(t);
  let hours = workDaysBefore(day) * HOURS_PER_DAY;
  if (isWorkDay(dowOfDayIndex(day))) {
    const h = istHourFloat(new Date(t));
    hours += Math.min(Math.max(h - WORK_START_H, 0), HOURS_PER_DAY);
  }
  return hours;
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

  // Beyond three working weeks a countdown in WORKING days is meaningless —
  // "372d left" reads like calendar days and is off by months. Show the real
  // date instead, the way Asana does for anything far out.
  if (absDays > 15) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: TZ, day: "2-digit", month: "short", year: "numeric",
    }).format(due);
  }

  // Precision that matches how people actually think: hours only matter when
  // the deadline is close. Past a week, "521d 1h left" is noise that also
  // wrapped the Due column onto two lines.
  let label = "";
  if (absDays >= 7) label = `${absDays}d`;
  else if (absDays > 0 && absHours > 0) label = `${absDays}d ${absHours}h`;
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

/**
 * Count working hours between two dates (positive if end > start).
 * O(1) — see workHoursSinceEpoch. The previous implementation looped one
 * day at a time (capped at 730 iterations, which silently truncated results
 * for far-future dates) and called Intl formatters inside the loop.
 */
function countWorkingHours(start: Date, end: Date): number {
  return workHoursSinceEpoch(end.getTime()) - workHoursSinceEpoch(start.getTime());
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
