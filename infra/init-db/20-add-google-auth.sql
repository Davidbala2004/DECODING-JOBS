-- Links a user row to the Google account that authenticated it. Nullable —
-- existing email-only users have no Google identity until they sign in with
-- Google, at which point this gets set (matched/created by email).
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(64) UNIQUE;
