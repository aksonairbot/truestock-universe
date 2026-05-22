"use client";

// Client wrapper for the Submit Review button.
// Shows a confirm() dialog before allowing the form submission to proceed.
// The form-level `action` server action handles the actual submission;
// this button just adds the confirmation gate and supplies action=submit.

export default function SubmitButton() {
  return (
    <button
      type="submit"
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
