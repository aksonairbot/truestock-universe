import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#08090C",
        "bg-2": "#0D0F14",
        panel: "#0F1117",
        "panel-2": "#14161F",
        hover: "#181B25",
        border: "rgba(255,255,255,0.06)",
        "border-2": "rgba(255,255,255,0.10)",
        "border-3": "rgba(255,255,255,0.18)",
        text: "#E8EAF0",
        "text-2": "#9AA0B4",
        "text-3": "#5A5F72",
        accent: "#7B5CFF",
        "accent-2": "#9A7DFF",
        "p-bee": "#F5B84A",
        "p-high": "#4ADE80",
        "p-axe": "#A78BFA",
        "p-bloom": "#F472B6",
        success: "#4ADE80",
        warning: "#F5B84A",
        danger: "#F87171",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
