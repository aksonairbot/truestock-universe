-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  head_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_uq ON departments (name);

-- Add department_id column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_department_idx ON users (department_id);

-- Seed initial departments
INSERT INTO departments (name, color) VALUES
  ('Product Design', '#8B5CF6'),
  ('Digital Marketing', '#F59E0B'),
  ('Technology', '#3B82F6'),
  ('Product', '#10B981')
ON CONFLICT (name) DO NOTHING;
