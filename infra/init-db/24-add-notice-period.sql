-- How soon a candidate can join — a top hiring-decision field recruiters
-- ask for, previously missing entirely from the candidate profile.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notice_period VARCHAR(20);
