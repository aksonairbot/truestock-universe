-- 0013: review_attachments table
-- Allows users to attach PDFs, presentations, or documents to their review responses.

CREATE TABLE IF NOT EXISTS review_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES review_responses(id) ON DELETE CASCADE,
  uploader_id UUID NOT NULL REFERENCES users(id),
  filename TEXT NOT NULL,
  mime TEXT,
  size_bytes BIGINT NOT NULL,
  spaces_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_attachments_response_idx ON review_attachments(response_id);
