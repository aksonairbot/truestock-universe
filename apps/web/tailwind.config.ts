import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark cosmic palette — matches truestock_universe_prototype.html exactly
        bg: "#08090C",
        "bg-2": "#0D0F14",
        "bg-3": "#12141B",
        panel: "#0F1117",
        "panel-2": "#14161F",
        hover: "#181B25",
        border: "rgba(255,255,255,0.06)",
        "border-2": "rgba(255,255,255,0.10)",
        "border-3": "rgba(255,255,255,0.18)",
        text: "#E8EAF0",
        "text-2": "#9AA0B4",
        "text-3": "#5A5F72",
        "text-4": "#3D4155",
        accent: "#7B5CFF",
        "accent-2": "#9A7DFF",
        "accent-glow": "rgba(123,92,255,0.25)",
        "accent-wash": "rgba(123,92,255,0.08)",
        success: "#4ADE80",
        "success-wash": "rgba(74,222,128,0.10)",
        warning: "#F5B84A",
        "warning-wash": "rgba(245,184,74,0.12)",
        danger: "#F87171",
        "danger-wash": "rgba(248,113,113,0.12)",
        info: "#60A5FA",
        "info-wash": "rgba(96,165,250,0.10)",
        // product brand colors (used in dots + chips)
        "p-bee": "#F5B84A",
        "p-high": "#4ADE80",
        "p-axe": "#A78BFA",
        "p-bloom": "#F472B6",
        // chart palette — same as prototype
        "chart-1": "#7B5CFF",
        "chart-2": "#22D3EE",
        "chart-3": "#F5B84A",
        "chart-4": "#4ADE80",
        "chart-5": "#F472B6",
      },
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
