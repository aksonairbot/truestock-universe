import { describe, it, expect } from "vitest";
import {
  formatInrFromPaise,
  formatDelta,
  formatDateShort,
  formatRelative,
} from "./format.js";

describe("formatInrFromPaise", () => {
  it("formats sub-thousand amounts as plain rupees", () => {
    expect(formatInrFromPaise(49900n)).toBe("₹499");
    expect(formatInrFromPaise(100n)).toBe("₹1");
    expect(formatInrFromPaise(0n)).toBe("₹0");
  });

  it("uses Indian grouping for thousands", () => {
    // ₹12,345 (12,34,500 paise)
    expect(formatInrFromPaise(1234500n)).toBe("₹12,345");
    // ₹99,999
    expect(formatInrFromPaise(9999900n)).toBe("₹99,999");
  });

  it("uses L suffix for lakhs", () => {
    // ₹1.5L = 1,50,000 rupees = 1,50,00,000 paise
    expect(formatInrFromPaise(15000000n)).toBe("₹1.50 L");
    // ₹82.35 L (≈ 82,34,567 rupees)
    expect(formatInrFromPaise(823456700n)).toBe("₹82.35 L");
  });

  it("uses Cr suffix for crores", () => {
    // ₹1 Cr = 1,00,00,000 rupees = 1,00,00,00,000 paise
    expect(formatInrFromPaise(1_00_00_00_000n)).toBe("₹1.00 Cr");
    // ₹4.82 Cr
    expect(formatInrFromPaise(4_82_00_00_000n)).toBe("₹4.82 Cr");
  });

  it("handles negative amounts (refunds)", () => {
    expect(formatInrFromPaise(-49900n)).toBe("-₹499");
  });

  it("respects compact:false for exact rupee display", () => {
    expect(formatInrFromPaise(15000000n, { compact: false })).toBe("₹1,50,000");
  });

  it("respects withSymbol:false for bare numbers", () => {
    expect(formatInrFromPaise(49900n, { withSymbol: false })).toBe("499");
  });

  it("returns — for null/undefined input", () => {
    expect(formatInrFromPaise(null)).toBe("—");
    expect(formatInrFromPaise(undefined)).toBe("—");
  });

  it("accepts number input too (as paise)", () => {
    expect(formatInrFromPaise(49900)).toBe("₹499");
  });
});

describe("formatDelta", () => {
  it("formats positive delta with up arrow", () => {
    expect(formatDelta(12.4)).toBe("▲ 12.4%");
  });
  it("formats negative delta with down arrow", () => {
    expect(formatDelta(-7.4)).toBe("▼ 7.4%");
  });
  it("handles zero as flat", () => {
    expect(formatDelta(0)).toBe("● 0.0%");
  });
  it("returns — for null/undefined/NaN", () => {
    expect(formatDelta(null)).toBe("—");
    expect(formatDelta(undefined)).toBe("—");
    expect(formatDelta(NaN)).toBe("—");
  });
  it("respects custom suffix", () => {
    expect(formatDelta(3.2, "pp")).toBe("▲ 3.2pp");
  });
});

describe("formatDateShort", () => {
  it("returns Mon D", () => {
    const d = new Date("2026-04-19T00:00:00Z");
    expect(formatDateShort(d)).toMatch(/Apr/);
  });
  it("returns — for null", () => {
    expect(formatDateShort(null)).toBe("—");
  });
});

describe("formatRelative", () => {
  it("formats seconds", () => {
    const d = new Date(Date.now() - 30 * 1000);
    expect(formatRelative(d)).toMatch(/s ago/);
  });
  it("formats minutes", () => {
    const d = new Date(Date.now() - 10 * 60 * 1000);
    expect(formatRelative(d)).toMatch(/m ago/);
  });
  it("formats hours", () => {
    const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelative(d)).toMatch(/h ago/);
  });
  it("formats days", () => {
    const d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelative(d)).toMatch(/d ago/);
  });
  it("falls back to short date for older dates", () => {
    const d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    expect(formatRelative(d)).toMatch(/[A-Z][a-z]{2}/);
  });
  it("returns — for null", () => {
    expect(formatRelative(null)).toBe("—");
  });
});
