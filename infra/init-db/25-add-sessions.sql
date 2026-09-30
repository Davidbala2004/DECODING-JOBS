-- Real authentication: single-use magic-link tokens (emailed, 15-min TTL)
-- exchanged for a longer-lived bearer session token. Replaces the previous
-- "trust whatever email string the client sends" identity model used by
-- every endpoint — see app/services/auth.py and app/core/security.py.
CREATE TABLE IF NOT EXISTS magic_link_tokens (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_email ON magic_link_tokens (email);

CREATE TABLE IF NOT EXISTS sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);

-- min_experience_years defaulted to 0 for every ingested job (Adzuna has no
-- such field at all, so this was never a real "0 years required" signal,
-- just an accidental default that read as "fresher role"). NULL now means
-- "unknown" instead of silently lying.
ALTER TABLE jobs ALTER COLUMN min_experience_years DROP NOT NULL;
ALTER TABLE jobs ALTER COLUMN min_experience_years DROP DEFAULT;
