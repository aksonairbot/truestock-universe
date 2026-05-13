-- 0005_daily_reviews.sql
-- Pre-generated AI review snippets (personal + team summary)

CREATE TABLE IF NOT EXISTS daily_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,   -- NULL = team summary row
  date        date NOT NULL,
  tone        text NOT NULL,
  body        text NOT NULL,
  stats       jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX daily_reviews_user_date_uq ON daily_reviews (user_id, date);
CREATE INDEX daily_reviews_date_idx ON daily_reviews (date);
