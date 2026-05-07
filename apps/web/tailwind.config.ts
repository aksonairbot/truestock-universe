import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Cream-on-cream palette inspired by Claude.ai + Asana sidebar structure.
        // Main canvas is cream; cards are white-with-warm-tint; sidebar is slightly darker cream.
        bg: "#F7F4EE",            // main canvas
        "bg-2": "#FFFFFF",        // pure white sub-areas
        panel: "#FFFFFF",         // card background
        "panel-2": "#F0ECE2",     // hover, secondary panels, sidebar
        "panel-3": "#E8E3D5",     // deeper accents
        hover: "#ECE9E0",
        border: "rgba(60,40,20,0.08)",
        "border-2": "rgba(60,40,20,0.14)",
        "border-3": "rgba(60,40,20,0.24)",
        text: "#2A2622",          // near-black warm
        "text-2": "#5E574E",      // muted body
        "text-3": "#8E867A",      // tertiary / hints
        accent: "#C8643B",        // Claude coral
        "accent-2": "#A85427",    // hover state
        "accent-soft": "#F5E4D9", // soft accent fill
        // legacy product colors retained
        "p-bee": "#D49B2D",
        "p-high": "#16A34A",
        "p-axe": "#7C5CDB",
        "p-bloom": "#D6447F",
        success: "#16A34A",
        warning: "#D97706",
        danger: "#DC2626",
      },
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui"],
        serif: ['"Source Serif 4"', '"Iowan Old Style"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.02)",
        card: "0 2px 4px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)",
      },
    },
  },
  plugins: [],
} satisfies Config;
