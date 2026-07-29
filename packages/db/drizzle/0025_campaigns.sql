-- 0025: Campaigns (digital media planning)
--
-- A campaign is the unit marketing teams actually plan in: "Diwali push",
-- "StockBee launch". It spans many channels, several weeks and a budget,
-- and it cuts ACROSS products — so it cannot be modelled as a project.
--
--   project  = which product the work belongs to (StockBee, Bloom Algo…)
--   campaign = which push the work is part of, whatever the product
--
-- Both are optional-orthogonal: a task has exactly one project (required,
-- unchanged) and at most one campaign.
--
-- MONEY IS STORED IN PAISE AS bigint. Never float — 0.1 + 0.2 problems in a
-- budget column are how media plans quietly stop reconciling. The existing
-- formatInrFromPaise() helper already renders these as ₹/L/Cr.

CREATE TABLE IF NOT EXISTS campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  objective     text,
  status        text NOT NULL DEFAULT 'planning',
  start_date    date,
  end_date      date,
  budget_paise  bigint NOT NULL DEFAULT 0,
  owner_id      uuid REFERENCES users(id),
  project_id    uuid REFERENCES projects(id),
  color         text,
  archived_at   timestamptz,
  created_by_id uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_status_check') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
      CHECK (status IN ('planning', 'live', 'done', 'cancelled'));
  END IF;
  -- A campaign that ends before it starts is a data-entry slip that would
  -- silently produce an empty plan grid. Refuse it at the database.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_dates_check') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_dates_check
      CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_budget_check') THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaigns_budget_check
      CHECK (budget_paise >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS campaigns_status_idx   ON campaigns (status);
CREATE INDEX IF NOT EXISTS campaigns_owner_idx    ON campaigns (owner_id);
CREATE INDEX IF NOT EXISTS campaigns_archived_idx ON campaigns (archived_at);

-- ---------------------------------------------------------------------------
-- Task side: which campaign this piece of work belongs to, and what it costs.
-- ON DELETE SET NULL — deleting a campaign must never cascade into deleting
-- work. The tasks survive, unassigned.
-- ---------------------------------------------------------------------------
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS campaign_id  uuid REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS budget_paise bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_budget_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_budget_check CHECK (budget_paise >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tasks_campaign_idx ON tasks (campaign_id) WHERE campaign_id IS NOT NULL;
