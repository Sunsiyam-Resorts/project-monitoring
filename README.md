# project-monitoring

Sun Siyam Group project monitoring portal for budgets, payment requests, Finance processing, project progress and management reporting.

| Folder | What it is |
| --- | --- |
| [`backend/`](backend) | Go server: the API (`/api/index`), sign-in (password + authenticator, email reset, ERP single sign-on), PostgreSQL storage, the authoritative workflow rules, and serving the built frontend. |
| [`frontend/`](frontend) | Vite + React user interface. It also carries a JavaScript copy of the workflow rules for the browser-only demo workspace and for on-screen figures. |

Both copies of the workflow rules must stay identical: `npm run traces` (in `frontend/`) records the JavaScript rules while their tests run, and the Go parity test replays those recordings. See [PORTAL.md](PORTAL.md) for running and testing locally.

Developer setup: [Container deployment](docs/DEPLOYMENT.md), [PostgreSQL storage and setup](docs/DATABASE.md), and [example SQL schema](docs/database-example.sql).

Business workflow: [Specification](docs/SPECIFICATION.md), [first-review contract](docs/REVIEW-1.md), and [acceptance checks](docs/TESTING.md).
