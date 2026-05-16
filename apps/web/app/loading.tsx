// apps/web/app/loading.tsx
//
// Global loading state — shown by Next.js when navigating between routes.
// Renders the SeekPeek logo with a subtle pulse + rotating gradient ring.

export default function Loading() {
  return (
    <div className="sp-loader-wrap">
      {/* rotating ring behind the logo */}
      <div className="sp-loader-ring" />
      {/* static logo mark */}
      <div className="sp-loader-mark" />
      {/* brand name */}
      <div className="sp-loader-text">SeekPeek</div>

      <style>{`
        .sp-loader-wrap {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--bg);
          gap: 18px;
        }

        /* rotating gradient ring */
        .sp-loader-ring {
          width: 72px;
          height: 72px;
          border-radius: 18px;
          background: conic-gradient(from 200deg at 50% 50%, #7B5CFF, #22D3EE, #F472B6, #7B5CFF);
          position: absolute;
          animation: sp-spin 1.8s linear infinite, sp-pulse 1.8s ease-in-out infinite;
          box-shadow: 0 0 40px rgba(123, 92, 255, 0.4), 0 0 80px rgba(34, 211, 238, 0.15);
        }

        /* dark inner square — the logo itself */
        .sp-loader-mark {
          width: 72px;
          height: 72px;
          border-radius: 18px;
          background: conic-gradient(from 200deg at 50% 50%, #7B5CFF, #22D3EE, #F472B6, #7B5CFF);
          position: relative;
          z-index: 1;
        }
        .sp-loader-mark::after {
          content: "";
          position: absolute;
          inset: 6px;
          border-radius: 12px;
          background: var(--bg);
        }

        .sp-loader-text {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.12em;
          color: var(--text-3);
          text-transform: uppercase;
          position: relative;
          z-index: 1;
        }

        @keyframes sp-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sp-pulse {
          0%, 100% { opacity: 0.5; transform: rotate(0deg) scale(1); }
          50% { opacity: 1; transform: rotate(180deg) scale(1.12); }
        }
      `}</style>
    </div>
  );
}
