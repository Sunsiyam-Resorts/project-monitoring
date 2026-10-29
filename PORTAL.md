# Sun Siyam Project Monitoring Portal

First testing release for the agreed finance, Purchasing and Planning workflow. The existing README is preserved.

## Run

Node.js 22 or later:

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and choose **Explore demo workspace**. The demo uses labelled sample data and browser-local persistence. The role selector lets you test separate actors; it is not authentication. Demo and live data are never mixed.

For live login, copy `.env.example` to `.env`, configure PostgreSQL and the initial administrator, and restart. There are no committed default credentials. First sign-in requires enrolment in an authenticator app. Email OTP resets passwords once a verified Resend sender is connected.

## Included

- Dashboard: group/company/project scope, USD KPIs, project and category comparisons, CSV export and recent activity.
- Requests: main orders, individual payment requests, personal action queue, date/company/project/team/status filters, and committed balances not yet received by Finance.
- Master Data: companies, projects, approved USD budgets and category revisions, shared suppliers, currencies.
- User Manager: one role, team, approval level, company/group access, activation and initial passwords.
- Settings: permanent payment sequence with configurable display format, 10-minute locks, Admin unlock and full audit trail.
- Per-payment printable A4 document, separate approvals and separate payment PDFs.
- Persistent Node.js API, PostgreSQL storage, cookie sessions, scrypt password hashing, encrypted TOTP keys, rate limiting, email password reset, server-side permissions and transactional workflow updates.

## Validation

```sh
npm test
npm run build
```

Tests cover both approval workflows, independent instalments, corrections, role/company restrictions, locks, exact payments, duplicate checks, budget commitment and revisions, numbering, currency conversion, authentication helpers, and DOM navigation/form behaviour.

Browser visual verification, actual database integration, delivery of password reset email and Vercel deployment must be checked in the configured environment. No real database or email credentials are present in the repository.

See [specification](docs/SPECIFICATION.md), [deployment](docs/DEPLOYMENT.md) and [testing checklist](docs/TESTING.md).
