// apps/web/app/count-up.tsx
//
// Tiny client component: animates a numeric value from 0 → value over ~600ms.
// Used in My Day stats and anywhere a hero number wants a touch of life.
// Pure CSS would work too but JS gives us the exact "tick" feel.

"use client";

import { useEffect, useState, useRef } from "react";

export function CountUp({ value, durationMs = 600 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Respect reduced-motion → just snap.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    startRef.current = null;
    const startFrom = 0; // always start from 0 for the satisfying tick on first render

    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(startFrom + (value - startFrom) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return <span className="mono">{display}</span>;
}
