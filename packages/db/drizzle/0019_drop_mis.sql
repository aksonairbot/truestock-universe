-- 0019_drop_mis.sql
--
-- Scope decision 2026-05-22: SeekPeak is now pure task management.
-- The MIS (Truestock revenue dashboard) and marketing-automation product
-- lines are shelved. This migration removes the MIS schema surface.
--
-- What goes:
--   - products
--   - product_price_mappings
--   - metrics_daily
--   - product_id FK columns on projects, customers, subscriptions, payments
--   - the product_slug enum type
--
-- What stays (will be reframed as SeekPeak SaaS subscription billing for
-- tenants, when that flow is wired in):
--   - customers, subscriptions, payments, razorpay_events
--   - The Razorpay webhook route — currently audit-log-only.
--
-- This migration is DESTRUCTIVE. The dropped tables hold Truestock's own
-- historical revenue/MIS data. If you want to keep a copy:
--   pg_dump --table=products --table=product_price_mappings \
--           --table=metrics_daily $DATABASE_URL > mis_archive.sql
-- BEFORE running this.

BEGIN;

-- 1. Drop the FK columns first. They reference products(id), so we have
--    to clear them out before products itself can go.
ALTER TABLE projects DROP COLUMN IF EXISTS product_id;
ALTER TABLE customers DROP COLUMN IF EXISTS primary_product_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS product_id;
ALTER TABLE payments DROP COLUMN IF EXISTS product_id;

-- 2. Drop the dependent indexes if Postgres didn't already.
DROP INDEX IF EXISTS projects_product_idx;
DROP INDEX IF EXISTS subs_product_idx;
DROP INDEX IF EXISTS payments_product_captured_idx;
DROP INDEX IF EXISTS price_map_amount_idx;
DROP INDEX IF EXISTS price_map_product_idx;
DROP INDEX IF EXISTS price_map_plan_name_idx;
DROP INDEX IF EXISTS metrics_metric_date_idx;
DROP INDEX IF EXISTS metrics_product_date_idx;

-- 3. Drop the MIS tables.
DROP TABLE IF EXISTS metrics_daily;
DROP TABLE IF EXISTS product_price_mappings;
DROP TABLE IF EXISTS products;

-- 4. Drop the now-orphaned enum type.
DROP TYPE IF EXISTS product_slug;

COMMIT;
