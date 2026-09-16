-- Lets a job seeker opt out of recruiter candidate search entirely, rather
-- than being searchable purely as a side effect of filling in preferences.
-- Defaults true so existing/registered profiles keep working exactly as
-- they do today; the toggle only matters once someone actively turns it off.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_visible_to_recruiters BOOLEAN NOT NULL DEFAULT true;
