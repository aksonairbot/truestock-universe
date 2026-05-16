"use client";

import { useTheme } from "../theme-provider";

export default function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <section className="card mb-6">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[14px] font-semibold text-text">Appearance</h2>
      </div>
      <div className="px-6 py-5">
        <label className="block text-[12px] font-medium text-text-2 mb-3 uppercase tracking-wider">
          Theme
        </label>
        <div className="flex gap-3">
          {/* Dark option */}
          <button
            onClick={() => setTheme("dark")}
            className={`
              flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer w-[120px]
              ${theme === "dark"
                ? "border-accent bg-accent-wash"
                : "border-border-2 hover:border-border-3 bg-transparent"
              }
            `}
          >
            <div
              className="w-full h-[60px] rounded-lg flex flex-col gap-1 p-2"
              style={{ background: "#0F1117", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div className="h-1.5 w-8 rounded-full" style={{ background: "#5A5F72" }} />
              <div className="h-1.5 w-12 rounded-full" style={{ background: "#3D4155" }} />
              <div className="h-1.5 w-6 rounded-full" style={{ background: "#7B5CFF" }} />
            </div>
            <span className="text-[12px] font-medium text-text">Dark</span>
          </button>

          {/* Light option */}
          <button
            onClick={() => setTheme("light")}
            className={`
              flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer w-[120px]
              ${theme === "light"
                ? "border-accent bg-accent-wash"
                : "border-border-2 hover:border-border-3 bg-transparent"
              }
            `}
          >
            <div
              className="w-full h-[60px] rounded-lg flex flex-col gap-1 p-2"
              style={{ background: "#FFFFFF", border: "1px solid rgba(0,0,0,0.1)" }}
            >
              <div className="h-1.5 w-8 rounded-full" style={{ background: "#B0B0C0" }} />
              <div className="h-1.5 w-12 rounded-full" style={{ background: "#8E8EA0" }} />
              <div className="h-1.5 w-6 rounded-full" style={{ background: "#6B4CFF" }} />
            </div>
            <span className="text-[12px] font-medium text-text">Light</span>
          </button>
        </div>
      </div>
    </section>
  );
}
