-- Add banner_url column to projects table
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "banner_url" text;
