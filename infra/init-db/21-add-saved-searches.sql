-- A user's saved map filter combo, optionally with email alerts when new
-- matching jobs appear. email_alerts_enabled defaults false since sending
-- actually requires SENDGRID_API_KEY to be configured — without it, a saved
-- search still works as a quick-access shortcut, it just can't email.
CREATE TABLE IF NOT EXISTS saved_searches (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(120) NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    email_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches (user_id);
