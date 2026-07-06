-- Migration: add Nexify provider support
-- Run this against your database before deploying the Nexify integration

-- 1. Make job_id nullable in report_data (Nexify has no async job)
ALTER TABLE report_data ALTER COLUMN job_id DROP NOT NULL;

-- 2. Add provider column to report_data
ALTER TABLE report_data ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'enki';

-- 3. Add Nexify-specific columns
ALTER TABLE report_data ADD COLUMN IF NOT EXISTS domain      text;
ALTER TABLE report_data ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE report_data ADD COLUMN IF NOT EXISTS tq_score    text;
ALTER TABLE report_data ADD COLUMN IF NOT EXISTS coverage    numeric(10, 6);
ALTER TABLE report_data ADD COLUMN IF NOT EXISTS ctr         numeric(10, 6);

-- 4. Index for provider filter
CREATE INDEX IF NOT EXISTS idx_report_data_provider ON report_data(provider);

-- 5. Tracking table for Nexify fetches (replaces report_jobs for this provider)
CREATE TABLE IF NOT EXISTS nexify_fetches (
  id          bigserial PRIMARY KEY,
  date        date NOT NULL,
  breakdown   text NOT NULL,  -- 'daily' | 'hourly'
  status      text NOT NULL DEFAULT 'SUCCESS',
  records     integer,
  fetched_at  timestamptz DEFAULT now(),
  UNIQUE (date, breakdown)
);

CREATE INDEX IF NOT EXISTS idx_nexify_fetches_date ON nexify_fetches(date);
