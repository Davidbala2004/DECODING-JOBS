-- 29-add-feedback.sql
-- Tester feedback submissions from the private-beta feedback page (feedback/index.html).
--
-- The page previously had no backend: with no `endpoint` configured it fell back
-- to a `mailto:` link addressed to a placeholder inbox, so real submissions were
-- silently lost. This table gives the feedback a durable home so the team can
-- read every response straight from the database instead of an email client.

CREATE TABLE IF NOT EXISTS feedback_submissions (
    id                 BIGSERIAL PRIMARY KEY,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Per-tester attribution, set from the page's ?tester= query param.
    tester             VARCHAR(120),
    name               VARCHAR(200),
    email              VARCHAR(255),
    role               VARCHAR(60),
    -- Consent to quote publicly with first name. The form posts "yes" when ticked.
    quote_ok           BOOLEAN NOT NULL DEFAULT false,
    -- Seven 1-5 ratings, each nullable: a blank means "never got to it", which is
    -- itself a signal and must not be coerced to a number.
    rating_map         SMALLINT CHECK (rating_map     BETWEEN 1 AND 5),
    rating_search      SMALLINT CHECK (rating_search  BETWEEN 1 AND 5),
    rating_company     SMALLINT CHECK (rating_company BETWEEN 1 AND 5),
    rating_assistant   SMALLINT CHECK (rating_assistant BETWEEN 1 AND 5),
    rating_tracker     SMALLINT CHECK (rating_tracker BETWEEN 1 AND 5),
    rating_auth        SMALLINT CHECK (rating_auth    BETWEEN 1 AND 5),
    rating_overall     SMALLINT CHECK (rating_overall BETWEEN 1 AND 5),
    -- The three written answers.
    confused           TEXT,
    liked              TEXT,
    anything           TEXT,
    -- Provenance + abuse handling.
    source             VARCHAR(40) NOT NULL DEFAULT 'tester-feedback',
    user_agent         TEXT,
    ip_hash            VARCHAR(64),
    -- The exact request body as received — so a future question added to the form
    -- is captured even before a column exists for it, and nothing is ever lost.
    raw                JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tester ON feedback_submissions (tester);
