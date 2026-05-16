-- 0016_org_settings.sql
-- Single-row table for workspace-wide organisation settings.

CREATE TABLE IF NOT EXISTS org_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'My Organisation',
  logo_url text,
  domain text,
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  working_hours_start text NOT NULL DEFAULT '09:00',
  working_hours_end text NOT NULL DEFAULT '18:00',
  working_days jsonb NOT NULL DEFAULT '[1,2,3,4,5]',
  default_role text NOT NULL DEFAULT 'member',
  review_cycle_frequency text NOT NULL DEFAULT 'quarterly',
  notify_on_task_assign boolean NOT NULL DEFAULT true,
  notify_on_review_start boolean NOT NULL DEFAULT true,
  notify_on_due_soon boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed one row so the app always has settings to read
INSERT INTO org_settings (company_name) VALUES ('SeekPeek') ON CONFLICT DO NOTHING;
