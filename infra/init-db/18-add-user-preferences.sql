-- Job-seeker preferences, used to personalize search/chat without asking
-- the user to retype context every time.
ALTER TABLE users ADD COLUMN IF NOT EXISTS target_roles JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_cities JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_work_mode VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS min_salary INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills JSONB;
