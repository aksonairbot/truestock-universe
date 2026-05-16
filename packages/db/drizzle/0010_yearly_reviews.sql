-- 0010: Yearly reviews
-- Three tables: review_cycles, review_questions, review_responses

-- Enums
DO $$ BEGIN
  CREATE TYPE review_cycle_status AS ENUM ('draft', 'open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_response_status AS ENUM ('pending', 'in_progress', 'submitted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Review cycles (one per FY)
CREATE TABLE IF NOT EXISTS review_cycles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  fy_start      date NOT NULL,
  fy_end        date NOT NULL,
  deadline      timestamptz,
  status        review_cycle_status NOT NULL DEFAULT 'draft',
  created_by_id uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Questions (ordered set per cycle)
CREATE TABLE IF NOT EXISTS review_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id      uuid NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  order_index   integer NOT NULL DEFAULT 0,
  question_text text NOT NULL,
  help_text     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_questions_cycle_idx ON review_questions(cycle_id, order_index);

-- Responses (one per member per cycle, answers as JSONB)
CREATE TABLE IF NOT EXISTS review_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id      uuid NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id),
  status        review_response_status NOT NULL DEFAULT 'pending',
  answers       jsonb NOT NULL DEFAULT '{}',
  submitted_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS review_responses_cycle_user_idx ON review_responses(cycle_id, user_id);
CREATE INDEX IF NOT EXISTS review_responses_user_idx ON review_responses(user_id);
