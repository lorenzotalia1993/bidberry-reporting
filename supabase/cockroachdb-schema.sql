-- Schema per CockroachDB Serverless

CREATE TABLE IF NOT EXISTS report_jobs (
  id          BIGSERIAL PRIMARY KEY,
  job_id      INTEGER NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'QUEUED',
  breakdown   TEXT NOT NULL,
  date_from   DATE NOT NULL,
  date_to     DATE NOT NULL,
  records     INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_data (
  id                BIGSERIAL PRIMARY KEY,
  job_id            INTEGER NOT NULL REFERENCES report_jobs(job_id),
  breakdown         TEXT NOT NULL,
  config_name       TEXT,
  report_date       DATE,
  report_hour       INTEGER,
  revenue           DECIMAL(18, 6),
  amount_eur        DECIMAL(18, 6),
  clicks            INTEGER,
  searches          INTEGER,
  bidded_searches   INTEGER,
  bidded_results    INTEGER,
  ads_query         TEXT,
  market            TEXT,
  device            TEXT,
  placement         TEXT,
  raw               JSONB,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_data_date      ON report_data(report_date);
CREATE INDEX IF NOT EXISTS idx_report_data_breakdown ON report_data(breakdown);
CREATE INDEX IF NOT EXISTS idx_report_jobs_status    ON report_jobs(status);
