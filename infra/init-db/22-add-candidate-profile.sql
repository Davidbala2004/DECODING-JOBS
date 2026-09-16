-- Candidate-side fields recruiters search/filter on, plus a record of which
-- companies have unlocked which candidate's full profile (free for now, but
-- keeping this table means a credits system can be layered on later without
-- a schema rework).
ALTER TABLE users ADD COLUMN IF NOT EXISTS experience_years SMALLINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS leetcode_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS leetcode_verified BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS candidate_unlocks (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unlocked_by_email VARCHAR(320) NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_candidate_unlocks_company_id ON candidate_unlocks (company_id);
