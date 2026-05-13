-- Add review_requested to the notification_kind enum
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'review_requested';
