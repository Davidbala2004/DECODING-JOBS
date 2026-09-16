-- A job's functional department (Engineering, Data & AI, DevOps & Infra, QA,
-- Design, Product, Security, HR & Recruiting, Support, Other), used to filter
-- by role type instead of an all-or-nothing tech/non-tech decision.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS department VARCHAR(40);
CREATE INDEX IF NOT EXISTS idx_jobs_department ON jobs (department);
