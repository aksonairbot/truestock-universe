"use client";

import { useRef } from "react";

export default function SubmitButton({ formAction }: { formAction: (fd: FormData) => Promise<void> }) {
  const formRef = useRef<HTMLFormElement | null>(null);

  return (
    <button
      type="submit"
      formAction={formAction}
      name="action"
      value="submit"
      className="btn btn-primary btn-sm"
      onClick={(e) => {
        if (!confirm("Once submitted you cannot edit your answers. Are you sure?")) {
          e.preventDefault();
        }
      }}
    >
      Submit Review
    </button>
  );
}
