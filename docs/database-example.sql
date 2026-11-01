-- Sun Siyam Project Monitoring: PostgreSQL schema reference.
-- Repository: Sunsiyam-Resorts/project-monitoring
-- This file contains no credentials, users or finance records.
-- The app creates these tables automatically in lib/store.mjs.
-- Optional use on a development database:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/database-example.sql
-- The database and login role must already exist. This is not a data migration.

BEGIN;

-- One complete workspace, with schema version 2 inside data.
-- Companies, projects, budgets, suppliers, currencies, users, orders,
-- payment requests, amendments, document contents, audit, record locks,
-- numbering settings and scoped counters live inside this JSONB document.
CREATE TABLE IF NOT EXISTS portal_state (
    id integer PRIMARY KEY CHECK (id = 1),
    data jsonb NOT NULL
);

-- token is a SHA-256 hash of the browser session token, never the raw cookie.
-- user_id refers to data.users[].id inside portal_state (no SQL foreign key).
CREATE TABLE IF NOT EXISTS portal_sessions (
    token text PRIMARY KEY,
    user_id text NOT NULL,
    expires timestamptz NOT NULL
);

-- Short-lived sign-in, authenticator enrollment and email-reset challenges.
-- token and reset OTPs are hashed; pending TOTP secrets are encrypted.
CREATE TABLE IF NOT EXISTS portal_challenges (
    token text PRIMARY KEY,
    data jsonb NOT NULL,
    expires timestamptz NOT NULL
);

-- Authentication attempts are throttled in a 15-minute window per key.
CREATE TABLE IF NOT EXISTS portal_throttle (
    key text PRIMARY KEY,
    attempts integer NOT NULL,
    expires timestamptz NOT NULL
);

COMMIT;

-- Do NOT seed portal_state with an empty row. First application startup inserts
-- emptyState() plus the Admin configured through the environment. Inserting a
-- row here would prevent that bootstrap and could leave no usable Admin.
-- No DROP, TRUNCATE, UPDATE or finance-data INSERT statements are included.

-- Read-only developer examples (uncomment individually after app bootstrap):

-- Inspect the workspace schema version without exposing private user fields:
-- SELECT data->>'version' AS workspace_version FROM portal_state WHERE id = 1;

-- List project identifiers and company relationships:
-- SELECT project->>'id' AS id, project->>'name' AS name,
--        project->>'companyId' AS company_id
-- FROM portal_state,
--      jsonb_array_elements(data->'projects') AS project
-- WHERE portal_state.id = 1;

-- Inspect payment references and statuses without extracting documents/users:
-- SELECT request->>'number' AS reference,
--        request->>'orderId' AS parent_order_id,
--        request->>'status' AS status,
--        request->>'currency' AS currency
-- FROM portal_state,
--      jsonb_array_elements(data->'requests') AS request
-- WHERE portal_state.id = 1;

-- Count live sessions without exposing token hashes:
-- SELECT count(*) AS active_sessions
-- FROM portal_sessions WHERE expires > now();
