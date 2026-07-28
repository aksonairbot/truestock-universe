// apps/web/lib/badge-events.ts
//
// Tiny shared constant so notification components can ask the sidebar to
// refresh its unread badges without importing the sidebar module itself
// (and without a context/provider for a single integer).
//
//   window.dispatchEvent(new Event(BADGE_REFRESH_EVENT))

export const BADGE_REFRESH_EVENT = "seekpeak:badges-refresh";
