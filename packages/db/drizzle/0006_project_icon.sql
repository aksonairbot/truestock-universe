-- 0006_project_icon.sql
-- Add icon_url column to projects table

ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon_url text;
