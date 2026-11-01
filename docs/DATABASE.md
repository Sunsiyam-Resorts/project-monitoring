# PostgreSQL setup and developer handover

The live portal uses PostgreSQL through `pg`. The self-hosted Node.js server (see [DEPLOYMENT.md](DEPLOYMENT.md)) runs the application and API; it connects to the database using `DATABASE_URL`. Browser demo data stays in browser storage and never seeds the live database.

## Initial setup

1. Create a PostgreSQL database and application login using your database provider. Use a TLS-enabled connection URL in production; pooled connections are supported. The application login needs permission to create and read/write the four tables below in its configured schema.
2. Configure the variables listed in [DEPLOYMENT.md](DEPLOYMENT.md): `DATABASE_URL`, `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AUTH_ENCRYPTION_KEY`, `RESEND_API_KEY` and `MAIL_FROM`. For local work, copy `.env.example` to the ignored `.env` file and fill it locally. Keep credentials out of GitHub.
3. Run `npm ci` and `npm run dev` locally, or start the configured application on the server with `npm start`. On the first API request needing storage, `lib/store.mjs` creates its tables. When no workspace exists, it inserts the initial workspace and Admin using a salted password hash. Keep the bootstrap Admin variables configured on later deployments; changing their values does not update an existing account.
4. Sign in using the configured Admin account. Choose **Scan QR code** or **Enter setup key** to enroll an authenticator, then verify its six-digit code. Both methods configure the same time-based authenticator. Subsequent sign-ins still require password and authenticator verification.
5. Add master data and users through the Admin screens. Run the live acceptance checks in [DEPLOYMENT.md](DEPLOYMENT.md) before using real records.

The optional [database-example.sql](database-example.sql) creates the same tables as the application. It is a schema reference for developers, with commented read-only inspection queries. It contains no sample credentials or finance records. It does not create a database, grant user permissions, provision a provider, or seed an Admin; application bootstrap performs the last step.

## Storage layout

| Table | Purpose |
| --- | --- |
| `portal_state` | One workspace row (`id = 1`) containing the business state as JSONB. |
| `portal_sessions` | Hashed session tokens, application user IDs and eight-hour expirations. |
| `portal_challenges` | Hashed challenge tokens and ten-minute enrollment, sign-in and email-reset challenges. |
| `portal_throttle` | Authentication attempt counts and fifteen-minute windows. |

The workspace contains `version`, `companies`, `projects`, `budgets`, `suppliers`, `currencies`, `users`, `orders`, `requests`, `audit`, `locks`, `settings`, `counters` and the legacy `sequence` field. Users and relationships are application records inside JSONB, rather than separate SQL tables with foreign keys.

- A company owns projects and approved budgets. Each budget holds categories, its saved currency/rate and earlier revisions.
- An order holds shared details, category allocations and supporting PDFs. A payment request points to its parent with `orderId` and has its own permanent reference, currency snapshot, approvals, history, remarks and payment evidence.
- Parent amendments retain proposals, prior effective values, decisions and supporting PDFs. Archived documents are downloaded only after company-access and active record-lock checks. General state responses omit PDF contents and authentication secrets.
- `settings` holds reference formats. `counters` preserves independent company/project sequences. Issued references are never regenerated during normal changes.
- PDF contents are base64 strings inside JSONB in this release. Each upload action has a combined 2 MB limit. Private object storage and normalized tables are future scaling improvements.

`passwordHash` uses salted scrypt. Enrolled TOTP secrets and pending enrollment keys are encrypted with `AUTH_ENCRYPTION_KEY`. QR images are generated inside the application server from the enrollment URI after password verification; no external QR service receives the secret, and QR images are not persisted as documents. Password reset uses emailed OTPs and preserves TOTP enrollment.

## Transactions, access and migrations

`transaction()` uses one checked-out database connection for `BEGIN`, `SELECT ... FOR UPDATE`, state migration, application actions, state update and `COMMIT`; errors roll back. The workspace row lock serializes changes, including duplicate validation and reference allocation. This favors consistency for the initial release and limits high-volume concurrency. The ten-minute user-facing record locks are separately stored in the workspace.

Company visibility and role actions are enforced by the API/domain layer. The schema does not define PostgreSQL row-level security policies for individual application users. SQL inspection must therefore be restricted to authorized developers/operators.

`migrateState()` performs the additive version-2 migration within the same transaction, preserving existing references, documents, history, budgets, users and audit. The example SQL is not a replacement for application migrations. Do not manually edit workspace JSON or reset counters as a maintenance shortcut.

Use the provider's backups and test restores in an isolated development database before a production migration. Keep database dumps, `.env`, encryption keys, enrollment QR images and real finance records out of GitHub. Retain the encryption key securely: rotating it requires re-encrypting existing authenticator secrets.
