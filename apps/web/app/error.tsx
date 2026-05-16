"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[APP ERROR]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="card max-w-md w-full text-center py-10">
        <div className="text-4xl mb-4" aria-hidden="true">&#9888;</div>
        <h1 className="text-lg font-semibold mb-2">Something went wrong</h1>
        <p className="text-sm text-text-2 mb-6 leading-relaxed">
          {error.message?.includes("session") || error.message?.includes("auth")
            ? "Your session may have expired. Please log in again."
            : "An unexpected error occurred. Please try again."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="btn btn-primary"
          >
            Try again
          </button>
          <a href="/api/auth/signin" className="btn btn-ghost">
            Log in
          </a>
        </div>
        {error.digest && (
          <p className="text-[10px] text-text-4 mt-4 mono">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
