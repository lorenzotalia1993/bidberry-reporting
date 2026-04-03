-- Tabella per tracciare i job ENKI
create table if not exists report_jobs (
  id          bigserial primary key,
  job_id      integer not null unique,
  status      text not null default 'QUEUED', -- QUEUED | RUNNING | FAILED | SUCCESS
  breakdown   text not null,                  -- daily | hourly | none
  date_from   date not null,
  date_to     date not null,
  records     integer,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Tabella per i dati dei report
create table if not exists report_data (
  id                bigserial primary key,
  job_id            integer not null references report_jobs(job_id),
  breakdown         text not null,
  config_name       text,
  report_date       date,
  report_hour       integer,
  revenue           numeric(18, 6),
  amount_eur        numeric(18, 6),
  clicks            integer,
  searches          integer,
  bidded_searches   integer,
  bidded_results    integer,
  ads_query         text,
  market            text,
  device            text,
  placement         text,
  raw               jsonb,
  created_at        timestamptz default now()
);

-- Indici
create index if not exists idx_report_data_date      on report_data(report_date);
create index if not exists idx_report_data_breakdown on report_data(breakdown);
create index if not exists idx_report_jobs_status    on report_jobs(status);
