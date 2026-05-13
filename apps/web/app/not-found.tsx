import Link from "next/link";

export default function NotFound() {
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
      <div style={{ fontSize: 48, opacity: 0.3 }}>404</div>
      <h2 style={{ fontSize: 18, color: "var(--text)", fontWeight: 600 }}>
        Page not found
      </h2>
      <p style={{ fontSize: 13 }}>
        The page you're looking for doesn't exist or was moved.
      </p>
      <Link href="/" className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>
        Go home
      </Link>
    </div>
  );
}
