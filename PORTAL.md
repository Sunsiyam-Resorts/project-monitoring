# Sun Siyam Project Monitoring Portal

Testing release for the Finance payment workflow (Revision 2: no approval teams; Finance maintains budgets) with project tasks and progress. The existing README is preserved.

## Run

The portal has two parts: a Go backend in `backend/` (Go 1.25) and a Vite + React frontend in `frontend/` (Node.js 22.12 or later).

```sh
cd frontend
npm ci
npm run build          # builds frontend/dist, which the backend serves
cd ../backend
go run ./cmd/portal    # http://127.0.0.1:3000
```

For frontend work, also run `npm run dev` in `frontend/` and open http://127.0.0.1:5173: Vite reloads changes instantly and forwards `/api` to the backend on port 3000. Without Go installed, run the backend tools in Docker, for example `docker run --rm -v "$PWD/backend:/src" -w /src golang:1.25-alpine go test ./...`. `docker compose up -d --build` runs the complete portal with PostgreSQL, as on the server.

Choose **Explore demo workspace** on the sign-in page. The demo uses labelled sample data and browser-local persistence; it runs entirely in the browser and never reaches the backend's database. The role selector lets you test separate actors; it is not authentication. Demo and live data are never mixed.

For live login, copy `.env.example` to `.env` in the repository root (the backend reads it when started from `backend/`), configure PostgreSQL and the initial administrator, and restart. There are no committed default credentials. First sign-in requires enrolment in an authenticator app. Email OTP resets passwords once a verified Resend sender is connected.

## Included

- Dashboard: group/company/project scope, USD KPIs, project and category comparisons, CSV export and recent activity.
- Projects: every project with its task progress; each project page shows its budget, payments, progress, tasks, breakdowns and activity. Finance and Admin add and update tasks.
- Requests: main orders, individual payment requests, personal action queue, date/company/project/status filters, and committed balances not yet received by Finance.
- Master Data: companies, projects, approved USD budgets and category revisions, shared suppliers, currencies.
- User Manager: one role (Requester, Finance, Viewer or Admin), company/group access, activation and initial passwords.
- Deleted (Admin only): Admin deletes requests and payment requests, which then count nowhere; the page lists them with a deletion and restoration log, for review and restore.
- Settings: permanent payment sequence with configurable display format, 10-minute locks, Admin unlock and full audit trail.
- Per-payment printable A4 document, separate approvals and separate payment PDFs.
- Go API with PostgreSQL storage, cookie sessions, scrypt password hashing, encrypted TOTP keys, rate limiting, email password reset, server-side permissions and transactional workflow updates.

## Validation

```sh
cd frontend
npm test               # workflow rules, imports, UI (React in happy-dom)
npm run build
npm run traces         # after changing frontend/src/domain: re-record the rules for the Go parity test
cd ../backend
go vet ./...
go test ./...          # parity with the recorded JavaScript rules, authentication, API; PostgreSQL tests when TEST_DATABASE_URL is set
```

Tests cover both approval workflows, independent instalments, corrections, role/company restrictions, locks, exact payments, duplicate checks, budget commitment and revisions, numbering, currency conversion, authentication helpers, and DOM navigation/form behaviour.

Browser visual verification, actual database integration, delivery of password reset email, ERP single sign-on and the self-hosted deployment must be checked in the configured environment. No real database or email credentials are present in the repository.

See [specification](docs/SPECIFICATION.md), [deployment](docs/DEPLOYMENT.md) and [testing checklist](docs/TESTING.md).
