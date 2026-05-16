-- Add kind column to task_comments for review-badge comments
ALTER TABLE task_comments ADD COLUMN kind text;

-- Add new notification kinds for review outcomes
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'review_approved';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'review_revision';
