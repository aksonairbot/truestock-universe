"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 32,
        color: "var(--text-2)",
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.3 }}>⚠</div>
      <h2 style={{ fontSize: 18, color: "var(--text)", fontWeight: 600 }}>
        Something went wrong
      </h2>
      <p style={{ fontSize: 13, maxWidth: 400, textAlign: "center", lineHeight: 1.6 }}>
        {error.message || "An unexpected error occurred. Please try again."}
      </p>
      <button
        onClick={reset}
        className="btn btn-primary btn-sm"
        style={{ marginTop: 8 }}
      >
        Try again
      </button>
    </div>
  );
}
