-- ============================================================================
-- DECODING JOBS — performance indexes
--
-- The filter facets (/companies/sectors|stages|areas|types, /jobs/departments)
-- run GROUP BY over columns with no index, the map's active-job counts filter
-- on (company_id, is_active), and the alert sweep scans saved searches with
-- alerts enabled. These add the covering/partial indexes for all three so the
-- queries stay fast as the ingested dataset grows.
--
-- NOTE: init-db scripts only run on a fresh volume. For an existing database,
-- run this file manually (psql -f) or via the migration tooling once adopted.
-- ============================================================================

-- jobs: filter by department (facet counts + department filter).
CREATE INDEX IF NOT EXISTS idx_jobs_department
    ON jobs (department)
    WHERE is_active;

-- jobs: the "newest active jobs" ordering used by /jobs and the alert sweep.
CREATE INDEX IF NOT EXISTS idx_jobs_active_created_at
    ON jobs (created_at DESC)
    WHERE is_active;

-- jobs: the grouped active-job count on the map (WHERE company_id IN (...) AND is_active).
CREATE INDEX IF NOT EXISTS idx_jobs_company_active
    ON jobs (company_id)
    WHERE is_active;

-- companies: the city/sector/stage/area facet and filter columns.
CREATE INDEX IF NOT EXISTS idx_companies_city ON companies (city);
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies (sector);
CREATE INDEX IF NOT EXISTS idx_companies_stage ON companies (stage);
CREATE INDEX IF NOT EXISTS idx_companies_area ON companies (area);

-- saved searches: only the alert-enabled subset is ever swept.
CREATE INDEX IF NOT EXISTS idx_saved_searches_alerts
    ON saved_searches (last_checked_at)
    WHERE email_alerts_enabled;

-- users: recruiter candidate search prefilter (visibility + JSONB city containment).
CREATE INDEX IF NOT EXISTS idx_users_recruiter_visible
    ON users (preferred_work_mode, notice_period, experience_years)
    WHERE profile_visible_to_recruiters;
CREATE INDEX IF NOT EXISTS idx_users_preferred_cities
    ON users USING GIN (preferred_cities);
